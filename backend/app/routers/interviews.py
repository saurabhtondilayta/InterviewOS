from uuid import UUID

from fastapi import APIRouter, Depends, Query

from ..ai.client import AI_DISCLAIMER
from ..auth import RequestContext, get_ctx
from ..schemas import AnswerSubmit, CodingPracticeCreate, InterviewCreate
from ..services.interview import engine
from ..services.interview.rubric import RUBRIC_VERSION

router = APIRouter(prefix="/api", tags=["interviews"])


@router.post("/interviews", status_code=201)
def create(body: InterviewCreate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return engine.create_session(ctx, body.model_dump())


@router.get("/interviews")
def history(
    limit: int = Query(default=50, ge=1, le=200),
    practice: bool | None = None,
    ctx: RequestContext = Depends(get_ctx),
) -> list[dict]:
    q = (
        ctx.db.table("interview_sessions")
        .select(
            "id, role_title, interview_type, experience_level, start_difficulty, current_difficulty, status, "
            "is_company_specific, is_practice, rubric_version, answer_mode, created_at, started_at, ended_at, "
            "companies(name, slug), interview_reports(overall_score, suggested_next_difficulty)"
        )
        .eq("user_id", ctx.user_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if practice is not None:
        q = q.eq("is_practice", practice)
    return q.execute().data or []


@router.get("/interviews/trends")
def trends(ctx: RequestContext = Depends(get_ctx)) -> dict:
    """Score history grouped by (interview_type, rubric_version). Only sessions within the same
    group are comparable, so the frontend charts each group separately."""
    rows = (
        ctx.db.table("interview_reports")
        .select("session_id, interview_type, rubric_version, overall_score, dimension_averages, created_at")
        .eq("user_id", ctx.user_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    groups: dict[str, dict] = {}
    for r in rows:
        key = f"{r['interview_type']}:{r['rubric_version']}"
        g = groups.setdefault(key, {"interview_type": r["interview_type"], "rubric_version": r["rubric_version"], "points": []})
        g["points"].append(
            {"session_id": r["session_id"], "date": r["created_at"], "overall": r["overall_score"], "dimensions": r["dimension_averages"]}
        )
    return {"current_rubric": RUBRIC_VERSION, "groups": list(groups.values())}


@router.get("/interviews/{session_id}")
def detail(session_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return engine.session_detail(ctx, str(session_id)) | {"disclaimer": AI_DISCLAIMER}


@router.post("/interviews/{session_id}/next")
def next_question(session_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return engine.next_question(ctx, str(session_id))


@router.post("/interviews/{session_id}/questions/{question_id}/answer")
def answer(session_id: UUID, question_id: UUID, body: AnswerSubmit, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return engine.submit_answer(ctx, str(session_id), str(question_id), body.model_dump()) | {"disclaimer": AI_DISCLAIMER}


@router.post("/interviews/{session_id}/end")
def end(session_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return engine.end_session(ctx, str(session_id))


@router.delete("/interviews/{session_id}", status_code=204)
def delete(session_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> None:
    engine.get_session(ctx, str(session_id))
    ctx.db.table("interview_sessions").delete().eq("id", str(session_id)).execute()


# --- coding practice: a one-problem coding session ---------------------------
@router.post("/coding/practice", status_code=201)
def coding_practice(body: CodingPracticeCreate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    session = engine.create_session(
        ctx,
        {
            "job_role_id": body.job_role_id,
            "role_title": body.role_title or "Software Engineer",
            "interview_type": "coding",
            "experience_level": body.experience_level,
            "difficulty": body.difficulty,
            "duration_minutes": 30,
            "topics": [body.topic],
            "answer_mode": "text",
            "is_practice": True,
            "target_question_count": 1,
        },
    )
    first = engine.next_question(ctx, session["id"])
    return {"session_id": session["id"], **first}
