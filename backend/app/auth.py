"""Authentication: verify the Supabase access token sent by the frontend.

The token is validated by asking Supabase Auth (`GET /auth/v1/user`). This works with both
legacy HS256 and the newer asymmetric JWT signing keys, and rejects tokens for deleted users.
Successful lookups are cached briefly (keyed by a hash of the token, never the token itself).
"""

import hashlib
import threading
import time
from dataclasses import dataclass

import httpx
from fastapi import Depends, Header
from postgrest import SyncPostgrestClient

from .config import get_settings
from .db import _require_supabase, admin_db, user_db
from .errors import AuthError, ForbiddenError, ServiceNotConfigured

_CACHE_TTL_SECONDS = 60
_cache: dict[str, tuple[float, "CurrentUser"]] = {}
_cache_lock = threading.Lock()


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    access_token: str
    email_confirmed: bool


def _token_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _fetch_user(token: str) -> CurrentUser:
    _require_supabase()
    s = get_settings()
    try:
        resp = httpx.get(
            f"{s.supabase_url}/auth/v1/user",
            headers={"apikey": s.supabase_anon_key, "Authorization": f"Bearer {token}"},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        raise ServiceNotConfigured("Could not reach the authentication service.") from exc

    if resp.status_code in (401, 403):
        raise AuthError("Your session has expired. Please log in again.", code="session_expired")
    if resp.status_code != 200:
        raise AuthError("Could not verify your session.")

    data = resp.json()
    return CurrentUser(
        id=data["id"],
        email=data.get("email") or "",
        access_token=token,
        email_confirmed=bool(data.get("email_confirmed_at") or data.get("confirmed_at")),
    )


def verify_token(token: str) -> CurrentUser:
    key = _token_key(token)
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and hit[0] > now:
            return hit[1]

    user = _fetch_user(token)
    with _cache_lock:
        if len(_cache) > 5000:
            _cache.clear()
        _cache[key] = (now + _CACHE_TTL_SECONDS, user)
    return user


def invalidate_token(token: str) -> None:
    with _cache_lock:
        _cache.pop(_token_key(token), None)


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("You need to be logged in to do that.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise AuthError("You need to be logged in to do that.")
    user = verify_token(token)
    if not user.email_confirmed:
        raise ForbiddenError("Please verify your email address first.", code="email_not_verified")
    return user


@dataclass
class RequestContext:
    """Per-request bundle: the authenticated user plus an RLS-scoped database client."""

    user: CurrentUser
    db: SyncPostgrestClient

    @property
    def user_id(self) -> str:
        return self.user.id

    @property
    def admin(self) -> SyncPostgrestClient:
        return admin_db()


def get_ctx(user: CurrentUser = Depends(get_current_user)) -> RequestContext:
    return RequestContext(user=user, db=user_db(user.access_token))


def require_admin(ctx: RequestContext = Depends(get_ctx)) -> RequestContext:
    rows = ctx.db.table("admin_users").select("user_id").eq("user_id", ctx.user_id).execute().data
    if not rows:
        raise ForbiddenError("Administrator access is required.")
    return ctx
