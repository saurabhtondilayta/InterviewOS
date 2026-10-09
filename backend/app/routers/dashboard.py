"""Dashboard metrics. Every number is derived from the user's own database records; when a
record type does not exist yet the value is null/empty so the UI shows an empty state."""

from fastapi import APIRouter, Depends

from ..auth import RequestContext, get_ctx
from ..services import context as cctx

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def dashboard(ctx: RequestContext = Depends(get_ctx)) -> dict:
    db, uid = ctx.db, ctx.user_id

    completed = (
        db.table("interview_sessions").select("id", count="exact", head=True).eq("user_id", uid).eq("status", "completed").execute().count
        or 0
    )
    reports = (
        db.table("interview_reports")
        .select(
            "session_id, interview_type, rubric_version, overall_score, topic_scores, created_at, interview_sessions(role_title, is_practice)"
        )
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
        .data
        or []
    )

    topic_totals: dict[str, list[float]] = {}
    for r in reports:
        for topic, s in (r.get("topic_scores") or {}).items():
            topic_totals.setdefault(topic, []).append(float(s["average"]))
    topic_avgs = sorted(((t, round(sum(v) / len(v), 1), len(v)) for t, v in topic_totals.items()), key=lambda x: x[1])
    weakest = [{"topic": t, "average": a, "reports": n} for t, a, n in topic_avgs if a < 6][:5]
    strongest = [{"topic": t, "average": a, "reports": n} for t, a, n in reversed(topic_avgs) if a >= 7][:5]

    analysis = (
        db.table("resume_analyses")
        .select("id, target_role, overall_score, created_at, result->weaknesses, result->missing_skills")
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    latest_analysis = analysis[0] if analysis else None

    recommended: list[dict] = [{"topic": w["topic"], "reason": f"Average {w['average']}/10 in recent interviews"} for w in weakest]
    if latest_analysis:
        for m in (latest_analysis.get("missing_skills") or [])[:4]:
            if m.get("importance") in ("high", "medium"):
                recommended.append({"topic": m["skill"], "reason": f"Missing for {latest_analysis['target_role']} (resume analysis)"})

    plan_rows = (
        db.table("learning_plans")
        .select(
            "id, title, duration_days, start_date, learning_plan_tasks(id, day_number, sort_order, title, topic, task_type, estimated_minutes, completed_at)"
        )
        .eq("user_id", uid)
        .eq("is_active", True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    plan = None
    if plan_rows:
        p = plan_rows[0]
        tasks = sorted(p.pop("learning_plan_tasks"), key=lambda t: (t["day_number"], t["sort_order"]))
        done = sum(1 for t in tasks if t["completed_at"])
        p["progress"] = {"completed": done, "total": len(tasks)}
        p["upcoming"] = [t for t in tasks if not t["completed_at"]][:5]
        days: dict[int, dict] = {}
        for t in tasks:
            d = days.setdefault(t["day_number"], {"day": t["day_number"], "minutes": 0, "completed": 0, "total": 0})
            d["minutes"] += t["estimated_minutes"] or 0
            d["total"] += 1
            d["completed"] += 1 if t["completed_at"] else 0
        p["week"] = [days[k] for k in sorted(days)][:7]
        plan = p

    saved = (
        db.table("saved_jobs")
        .select("id, created_at, companies(name, slug), job_roles(title), job_listings(title)")
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .limit(5)
        .execute()
        .data
        or []
    )

    sessions = (
        db.table("interview_sessions")
        .select("id, role_title, interview_type, status, created_at")
        .eq("user_id", uid)
        .order("created_at", desc=True)
        .limit(5)
        .execute()
        .data
        or []
    )
    activity = [
        {
            "type": "interview",
            "id": s["id"],
            "label": f"{s['interview_type'].replace('_', ' ').title()} interview - {s['role_title']}",
            "status": s["status"],
            "at": s["created_at"],
        }
        for s in sessions
    ]
    if latest_analysis:
        activity.append(
            {
                "type": "resume_analysis",
                "id": latest_analysis["id"],
                "label": f"Resume analysed for {latest_analysis['target_role']}",
                "status": "completed",
                "at": latest_analysis["created_at"],
            }
        )
    activity.sort(key=lambda a: a["at"], reverse=True)

    return {
        "interviews_completed": completed,
        "recent_scores": [
            {
                "session_id": r["session_id"],
                "interview_type": r["interview_type"],
                "rubric_version": r["rubric_version"],
                "overall_score": r["overall_score"],
                "role_title": (r.get("interview_sessions") or {}).get("role_title"),
                "created_at": r["created_at"],
            }
            for r in reports
        ],
        "strongest_topics": strongest,
        "weakest_topics": weakest,
        "recommended_topics": recommended[:6],
        "latest_resume_analysis": latest_analysis and {k: latest_analysis[k] for k in ("id", "target_role", "overall_score", "created_at")},
        "learning_plan": plan,
        "saved_jobs": saved,
        "recent_activity": activity[:8],
        "weak_topics_all": cctx.weak_topics(db, uid),
    }
