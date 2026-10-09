from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends

from ..ai.client import AI_DISCLAIMER
from ..auth import RequestContext, get_ctx
from ..errors import NotFoundError
from ..schemas import LearningPlanCreate, TaskUpdate
from ..services import learning_service

router = APIRouter(prefix="/api/learning-plans", tags=["learning"])


@router.post("", status_code=201)
def create(body: LearningPlanCreate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return learning_service.generate_plan(ctx, body.duration_days, body.daily_minutes, body.goals) | {"disclaimer": AI_DISCLAIMER}


@router.get("")
def list_plans(ctx: RequestContext = Depends(get_ctx)) -> list[dict]:
    return (
        ctx.db.table("learning_plans")
        .select("id, title, duration_days, daily_minutes, is_active, start_date, created_at")
        .eq("user_id", ctx.user_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


@router.get("/active")
def active(ctx: RequestContext = Depends(get_ctx)) -> dict | None:
    rows = (
        ctx.db.table("learning_plans")
        .select("id")
        .eq("user_id", ctx.user_id)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return learning_service.get_plan(ctx, rows[0]["id"]) if rows else None


@router.get("/{plan_id}")
def get(plan_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return learning_service.get_plan(ctx, str(plan_id))


@router.post("/{plan_id}/activate")
def activate(plan_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    learning_service.get_plan(ctx, str(plan_id))
    ctx.db.table("learning_plans").update({"is_active": False}).eq("user_id", ctx.user_id).eq("is_active", True).execute()
    ctx.db.table("learning_plans").update({"is_active": True}).eq("id", str(plan_id)).execute()
    return learning_service.get_plan(ctx, str(plan_id))


@router.patch("/tasks/{task_id}")
def update_task(task_id: UUID, body: TaskUpdate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    rows = (
        ctx.db.table("learning_plan_tasks")
        .update({"completed_at": datetime.now(UTC).isoformat() if body.completed else None})
        .eq("id", str(task_id))
        .execute()
        .data
    )
    if not rows:
        raise NotFoundError("Task not found.")
    return rows[0]


@router.delete("/{plan_id}", status_code=204)
def delete(plan_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> None:
    ctx.db.table("learning_plans").delete().eq("id", str(plan_id)).execute()
