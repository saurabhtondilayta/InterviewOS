"""Builds the minimal candidate context passed to the AI.

Only preparation-relevant fields are included. Name, email, college name and any contact
details are deliberately left out (data minimisation).
"""

from postgrest import SyncPostgrestClient

from ..services.resume_parser import redact_for_ai


def load_profile(db: SyncPostgrestClient, user_id: str) -> dict | None:
    rows = db.table("profiles").select("*").eq("id", user_id).limit(1).execute().data
    return rows[0] if rows else None


def load_skills(db: SyncPostgrestClient, user_id: str) -> list[str]:
    rows = db.table("user_skills").select("skills(name)").eq("user_id", user_id).execute().data or []
    return sorted({r["skills"]["name"] for r in rows if r.get("skills")})


def weak_topics(db: SyncPostgrestClient, user_id: str, limit_reports: int = 5) -> list[str]:
    """Topics averaging below 5/10 across the user's most recent interview reports."""
    rows = (
        db.table("interview_reports")
        .select("topic_scores")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit_reports)
        .execute()
        .data
        or []
    )
    totals: dict[str, list[float]] = {}
    for r in rows:
        for topic, s in (r.get("topic_scores") or {}).items():
            totals.setdefault(topic, []).append(float(s.get("average", 0)))
    weak = [(t, sum(v) / len(v)) for t, v in totals.items() if sum(v) / len(v) < 5]
    return [t for t, _ in sorted(weak, key=lambda x: x[1])]


def latest_resume(db: SyncPostgrestClient, user_id: str, resume_id: str | None = None) -> dict | None:
    q = db.table("resumes").select("id, extracted_text, original_filename, created_at").eq("user_id", user_id)
    if resume_id:
        q = q.eq("id", resume_id)
    else:
        q = q.order("is_primary", desc=True).order("created_at", desc=True)
    rows = q.limit(1).execute().data
    return rows[0] if rows else None


def latest_resume_analysis(db: SyncPostgrestClient, user_id: str) -> dict | None:
    rows = (
        db.table("resume_analyses")
        .select("target_role, overall_score, result, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def candidate_context(db: SyncPostgrestClient, user_id: str, *, include_performance: bool = True) -> dict:
    p = load_profile(db, user_id) or {}
    ctx: dict = {
        "degree": p.get("degree"),
        "branch": p.get("branch"),
        "current_year": p.get("current_year"),
        "graduation_year": p.get("graduation_year"),
        "years_experience": p.get("years_experience"),
        "preferred_role": p.get("preferred_role"),
        "target_roles": p.get("target_roles") or [],
        "preferred_companies": p.get("preferred_companies") or [],
        "skills": load_skills(db, user_id),
        "programming_languages": p.get("programming_languages") or [],
        "projects": [
            {"title": pr.get("title"), "technologies": pr.get("technologies"), "summary": pr.get("description")}
            for pr in (p.get("projects") or [])
        ][:8],
        "internships": [
            {"role": i.get("role"), "organization": i.get("organization"), "summary": i.get("description")}
            for i in (p.get("internships") or [])
        ][:6],
        "certifications": [c.get("name") for c in (p.get("certifications") or []) if c.get("name")][:10],
        "interview_experience": p.get("interview_experience"),
        "improvement_areas": p.get("improvement_areas") or [],
        "weekly_study_hours": p.get("weekly_study_hours"),
    }
    if include_performance:
        ctx["weak_topics_from_past_interviews"] = weak_topics(db, user_id)
        analysis = latest_resume_analysis(db, user_id)
        if analysis:
            result = analysis.get("result") or {}
            ctx["latest_resume_analysis"] = {
                "target_role": analysis.get("target_role"),
                "weaknesses": (result.get("weaknesses") or [])[:6],
                "missing_skills": [m.get("skill") for m in (result.get("missing_skills") or [])][:10],
            }
    # Drop empty values to keep prompts compact.
    return {k: v for k, v in ctx.items() if v not in (None, [], "", {})}


def resume_summary_for_ai(db: SyncPostgrestClient, user_id: str, resume_id: str | None = None) -> str | None:
    r = latest_resume(db, user_id, resume_id)
    if not r or not r.get("extracted_text"):
        return None
    return redact_for_ai(r["extracted_text"])[:6000]
