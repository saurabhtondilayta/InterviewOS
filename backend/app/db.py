"""Supabase data-access clients.

Two kinds of clients are used deliberately:

* ``user_db(token)``  - PostgREST client that carries the end user's JWT. Every query runs
  under Row Level Security, so a bug in an endpoint cannot leak another user's rows.
* ``admin_db()``      - service-role client that bypasses RLS. It is used only to write
  pipeline-owned records (AI analyses, evaluations, reports, usage logs) *after* the
  calling code has verified ownership with a user-scoped read, and for admin tasks.
"""

from functools import lru_cache

import httpx
from postgrest import SyncPostgrestClient
from storage3 import SyncStorageClient

from .config import get_settings
from .errors import ServiceNotConfigured


def _require_supabase() -> None:
    if not get_settings().supabase_configured:
        raise ServiceNotConfigured(
            "Supabase is not configured on the server. Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in backend/.env."
        )


@lru_cache
def _rest_http() -> httpx.Client:
    # Shared connection pool. postgrest sends absolute URLs and per-client auth headers on
    # every request, so one pool is safe to share between users.
    return httpx.Client(timeout=20)


def user_db(access_token: str) -> SyncPostgrestClient:
    _require_supabase()
    s = get_settings()
    return SyncPostgrestClient(
        f"{s.supabase_url}/rest/v1",
        headers={
            "apikey": s.supabase_anon_key,
            "Authorization": f"Bearer {access_token}",
        },
        http_client=_rest_http(),
    )


def user_storage(access_token: str) -> SyncStorageClient:
    _require_supabase()
    s = get_settings()
    return SyncStorageClient(
        f"{s.supabase_url}/storage/v1",
        {"apikey": s.supabase_anon_key, "Authorization": f"Bearer {access_token}"},
        timeout=30,
    )


@lru_cache
def admin_db() -> SyncPostgrestClient:
    _require_supabase()
    s = get_settings()
    return SyncPostgrestClient(
        f"{s.supabase_url}/rest/v1",
        headers={
            "apikey": s.supabase_service_role_key,
            "Authorization": f"Bearer {s.supabase_service_role_key}",
        },
        http_client=_rest_http(),
    )


@lru_cache
def admin_storage() -> SyncStorageClient:
    _require_supabase()
    s = get_settings()
    return SyncStorageClient(
        f"{s.supabase_url}/storage/v1",
        {
            "apikey": s.supabase_service_role_key,
            "Authorization": f"Bearer {s.supabase_service_role_key}",
        },
        timeout=30,
    )


def first_or_none(rows: list[dict] | None) -> dict | None:
    return rows[0] if rows else None
