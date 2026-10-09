"""Data export and account deletion."""

import logging

import httpx
from fastapi import APIRouter, Depends

from ..auth import RequestContext, get_ctx, invalidate_token
from ..config import get_settings
from ..db import admin_storage
from ..errors import AppError

router = APIRouter(prefix="/api/account", tags=["account"])
logger = logging.getLogger("interviewos.account")

_EXPORT_TABLES = [
    "profiles",
    "user_skills",
    "resumes",
    "resume_analyses",
    "interview_sessions",
    "interview_questions",
    "interview_responses",
    "answer_evaluations",
    "interview_reports",
    "learning_plans",
    "learning_plan_tasks",
    "chat_conversations",
    "chat_messages",
    "saved_jobs",
    "usage_logs",
]


@router.get("/export")
def export(ctx: RequestContext = Depends(get_ctx)) -> dict:
    """Everything stored about the user, read through RLS."""
    out: dict = {}
    for table in _EXPORT_TABLES:
        key = "id" if table == "profiles" else "user_id"
        out[table] = ctx.db.table(table).select("*").eq(key, ctx.user_id).execute().data or []
    for r in out["resumes"]:
        r.pop("storage_path", None)
    return out


@router.delete("", status_code=204)
def delete_account(ctx: RequestContext = Depends(get_ctx)) -> None:
    """Permanently delete the user's files, data and auth account.

    1. remove every object in the user's storage folder,
    2. delete the auth user (all application rows cascade from auth.users -> profiles).
    """
    s = get_settings()
    bucket = admin_storage().from_(s.resume_bucket)
    paths = [r["storage_path"] for r in ctx.db.table("resumes").select("storage_path").eq("user_id", ctx.user_id).execute().data or []]
    try:
        listed = bucket.list(ctx.user_id) or []
        paths += [f"{ctx.user_id}/{o['name']}" for o in listed if o.get("name")]
    except Exception:  # noqa: BLE001
        logger.warning("could not list storage folder during account deletion")
    if paths:
        bucket.remove(sorted(set(paths)))

    resp = httpx.delete(
        f"{s.supabase_url}/auth/v1/admin/users/{ctx.user_id}",
        headers={"apikey": s.supabase_service_role_key, "Authorization": f"Bearer {s.supabase_service_role_key}"},
        timeout=15,
    )
    if resp.status_code not in (200, 204):
        logger.error("auth user deletion failed with status %s", resp.status_code)
        raise AppError("We could not delete your account. Please try again.", code="delete_failed")
    invalidate_token(ctx.user.access_token)
