"""Per-user AI usage tracking and rate limiting backed by the usage_logs table.

Limits are counted from the database so they hold across server restarts and multiple
instances. Only metadata is logged (feature, model, token counts, latency, status) -
never prompts, resume text, answers, or keys.
"""

import logging
from datetime import UTC, datetime, timedelta

from .config import get_settings
from .db import admin_db
from .errors import RateLimitedError

logger = logging.getLogger("interviewos.usage")

# Features that have their own, tighter daily cap in addition to the global limits.
_FEATURE_DAILY_CAPS = {"resume_analysis": lambda s: s.resume_analyses_per_day}


def _count_since(user_id: str, since: datetime, feature: str | None = None) -> int:
    q = (
        admin_db()
        .table("usage_logs")
        .select("id", count="exact", head=True)
        .eq("user_id", user_id)
        .neq("status", "rate_limited")
        .gte("created_at", since.isoformat())
    )
    if feature:
        q = q.eq("feature", feature)
    return q.execute().count or 0


def check_rate_limit(user_id: str, feature: str) -> None:
    s = get_settings()
    now = datetime.now(UTC)

    hourly = _count_since(user_id, now - timedelta(hours=1))
    if hourly >= s.ai_requests_per_hour:
        record(user_id, feature, status="rate_limited")
        raise RateLimitedError(f"You've reached the limit of {s.ai_requests_per_hour} AI requests per hour. Please try again later.")

    daily = _count_since(user_id, now - timedelta(days=1))
    if daily >= s.ai_requests_per_day:
        record(user_id, feature, status="rate_limited")
        raise RateLimitedError(f"You've reached today's limit of {s.ai_requests_per_day} AI requests.")

    cap_fn = _FEATURE_DAILY_CAPS.get(feature)
    if cap_fn:
        cap = cap_fn(s)
        if _count_since(user_id, now - timedelta(days=1), feature) >= cap:
            record(user_id, feature, status="rate_limited")
            raise RateLimitedError(f"You can run up to {cap} {feature.replace('_', ' ')}s per day.")


def record(
    user_id: str | None,
    feature: str,
    *,
    status: str,
    model: str | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    latency_ms: int | None = None,
    error_code: str | None = None,
) -> None:
    """Best-effort logging: a logging failure must never break the user's request."""
    try:
        admin_db().table("usage_logs").insert(
            {
                "user_id": user_id,
                "feature": feature,
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "latency_ms": latency_ms,
                "status": status,
                "error_code": error_code,
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not record usage (%s)", type(exc).__name__)
