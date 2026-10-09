"""Personalised 7- or 30-day learning plans."""

from datetime import date

from ..ai import prompts
from ..ai.client import get_ai
from ..ai.schemas import LearningPlanAI
from ..auth import RequestContext
from ..errors import NotFoundError, ValidationFailed
from . import context as cctx


def generate_plan(ctx: RequestContext, duration_days: int, daily_minutes: int, goals: str | None) -> dict:
    if duration_days not in (7, 30):
        raise ValidationFailed("Plans can be 7 or 30 days long.")

    context = cctx.candidate_context(ctx.db, ctx.user_id)
    recent = (
        ctx.db.table("interview_reports")
        .select("interview_type, overall_score, summary, created_at")
        .eq("user_id", ctx.user_id)
        .order("created_at", desc=True)
        .limit(3)
        .execute()
        .data
        or []
    )
    context["recent_interviews"] = [
        {
            "type": r["interview_type"],
            "overall_score": r["overall_score"],
            "topics_to_revise": (r.get("summary") or {}).get("topics_to_revise", [])[:6],
        }
        for r in recent
    ]
    if not context.get("target_roles") and not context.get("preferred_role"):
        raise ValidationFailed("Add a target role to your profile first so the plan can be personalised.", code="profile_incomplete")

    plan, model = get_ai().structured(
        prompts.learning_plan(duration_days=duration_days, daily_minutes=daily_minutes, goals=goals, context=context),
        LearningPlanAI,
        user_id=ctx.user_id,
        feature="learning_plan",
        temperature=0.5,
        max_tokens=1200 + duration_days * 150,  # 30-day plans are much longer than 7-day ones
    )

    # Keep only days within range and trim days that exceed the time budget.
    days = sorted((d for d in plan.days if 1 <= d.day <= duration_days), key=lambda d: d.day)

    ctx.admin.table("learning_plans").update({"is_active": False}).eq("user_id", ctx.user_id).eq("is_active", True).execute()
    row = (
        ctx.admin.table("learning_plans")
        .insert(
            {
                "user_id": ctx.user_id,
                "title": plan.title[:200],
                "duration_days": duration_days,
                "daily_minutes": daily_minutes,
                "goals": goals,
                "inputs": {
                    "weak_topics": context.get("weak_topics_from_past_interviews", []),
                    "target_roles": context.get("target_roles", []),
                },
                "overview": plan.overview,
                "is_active": True,
                "start_date": date.today().isoformat(),
                "model": model,
            }
        )
        .execute()
        .data[0]
    )

    tasks = []
    for d in days:
        budget = daily_minutes
        for i, t in enumerate(d.tasks[:4]):
            minutes = min(t.estimated_minutes, budget)
            if minutes < 5:
                break
            budget -= minutes
            tasks.append(
                {
                    "plan_id": row["id"],
                    "user_id": ctx.user_id,
                    "day_number": d.day,
                    "sort_order": i,
                    "title": t.title[:200],
                    "description": t.description,
                    "topic": t.topic,
                    "task_type": t.task_type,
                    "estimated_minutes": minutes,
                }
            )
    if tasks:
        ctx.admin.table("learning_plan_tasks").insert(tasks).execute()
    return get_plan(ctx, row["id"])


def get_plan(ctx: RequestContext, plan_id: str) -> dict:
    rows = ctx.db.table("learning_plans").select("*, learning_plan_tasks(*)").eq("id", plan_id).limit(1).execute().data
    if not rows:
        raise NotFoundError("Learning plan not found.")
    plan = rows[0]
    plan["learning_plan_tasks"].sort(key=lambda t: (t["day_number"], t["sort_order"]))
    total = len(plan["learning_plan_tasks"])
    done = sum(1 for t in plan["learning_plan_tasks"] if t["completed_at"])
    plan["progress"] = {"completed": done, "total": total, "percent": round(done * 100 / total) if total else 0}
    return plan
