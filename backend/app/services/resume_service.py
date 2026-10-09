"""Resume upload, analysis and report export."""

import uuid

from ..ai import prompts
from ..ai.client import AI_DISCLAIMER, get_ai
from ..ai.schemas import ResumeAnalysisAI
from ..auth import RequestContext
from ..config import get_settings
from ..db import user_storage
from ..errors import NotFoundError, ValidationFailed
from . import context as cctx
from .resume_parser import parse_resume, redact_for_ai

# Documented weights for the practice score (see docs/SCORING.md). They sum to 1.0.
RESUME_SECTION_WEIGHTS: dict[str, float] = {
    "structure": 0.10,
    "education": 0.08,
    "skills": 0.15,
    "projects": 0.15,
    "experience": 0.12,
    "certifications": 0.05,
    "keywords": 0.10,
    "achievements": 0.10,
    "ats_formatting": 0.05,
    "role_alignment": 0.10,
}

SCORE_EXPLANATION = (
    "Practice score (0-100) = weighted average of ten section ratings (each 0-10, rated by the AI "
    "against a fixed rubric) x 10. Weights: skills 15%, projects 15%, experience 12%, structure 10%, "
    "keywords 10%, achievements 10%, role alignment 10%, education 8%, certifications 5%, ATS "
    "formatting 5%. This is not an official ATS score and does not predict selection."
)


def compute_resume_score(section_scores: list[dict]) -> tuple[float, dict]:
    by_section: dict[str, float] = {}
    for s in section_scores:
        by_section.setdefault(s["section"], float(s["score"]))
    breakdown = {}
    total = 0.0
    for section, weight in RESUME_SECTION_WEIGHTS.items():
        score = max(0.0, min(10.0, by_section.get(section, 0.0)))
        breakdown[section] = {"score": score, "weight": weight, "contribution": round(score * weight * 10, 1)}
        total += score * weight
    return round(total * 10, 1), breakdown


def upload_resume(ctx: RequestContext, filename: str, data: bytes) -> dict:
    s = get_settings()
    parsed = parse_resume(filename, data, s.max_resume_bytes)
    path = f"{ctx.user_id}/{uuid.uuid4()}{parsed.extension}"

    # Upload with the user's own token: storage RLS confines it to their folder.
    user_storage(ctx.user.access_token).from_(s.resume_bucket).upload(path, data, {"content-type": parsed.mime_type, "upsert": "false"})

    has_any = bool(ctx.db.table("resumes").select("id").eq("user_id", ctx.user_id).limit(1).execute().data)
    try:
        row = (
            ctx.admin.table("resumes")
            .insert(
                {
                    "user_id": ctx.user_id,
                    "storage_path": path,
                    "original_filename": filename[:255],
                    "mime_type": parsed.mime_type,
                    "size_bytes": len(data),
                    "extracted_text": parsed.text,
                    "page_count": parsed.page_count,
                    "is_primary": not has_any,
                }
            )
            .execute()
            .data[0]
        )
    except Exception:
        user_storage(ctx.user.access_token).from_(s.resume_bucket).remove([path])
        raise
    return public_resume(row)


def public_resume(row: dict) -> dict:
    return {k: v for k, v in row.items() if k != "extracted_text"} | {
        "text_preview": (row.get("extracted_text") or "")[:600],
        "text_length": len(row.get("extracted_text") or ""),
    }


def get_resume(ctx: RequestContext, resume_id: str) -> dict:
    rows = ctx.db.table("resumes").select("*").eq("id", resume_id).limit(1).execute().data
    if not rows:
        raise NotFoundError("Resume not found.")
    return rows[0]


def analyze_resume(ctx: RequestContext, resume_id: str, target_role: str, job_listing_id: str | None, job_description: str | None) -> dict:
    resume = get_resume(ctx, resume_id)
    jd_text = (job_description or "").strip() or None
    if job_listing_id:
        rows = (
            ctx.db.table("job_listings").select("title, description_text, required_skills").eq("id", job_listing_id).limit(1).execute().data
        )
        if not rows:
            raise NotFoundError("Job listing not found.")
        jl = rows[0]
        jd_text = f"{jl['title']}\nRequired skills: {', '.join(jl.get('required_skills') or [])}\n\n{jl.get('description_text') or ''}"
    if not target_role.strip():
        raise ValidationFailed("Enter the role you are targeting.")

    candidate = cctx.candidate_context(ctx.db, ctx.user_id, include_performance=False)
    result, model = get_ai().structured(
        prompts.resume_analysis(redact_for_ai(resume["extracted_text"] or ""), target_role, candidate, jd_text),
        ResumeAnalysisAI,
        user_id=ctx.user_id,
        feature="resume_analysis",
        temperature=0.2,
        max_tokens=5000,  # largest schema in the app
    )
    data = result.model_dump()
    score, breakdown = compute_resume_score(data["section_scores"])
    row = (
        ctx.admin.table("resume_analyses")
        .insert(
            {
                "resume_id": resume_id,
                "user_id": ctx.user_id,
                "target_role": target_role.strip()[:120],
                "job_listing_id": job_listing_id,
                "job_description_text": (job_description or None) and job_description[:20000],
                "model": model,
                "prompt_version": prompts.PROMPT_VERSION,
                "overall_score": score,
                "score_breakdown": breakdown,
                "result": data,
            }
        )
        .execute()
        .data[0]
    )
    return with_explanation(row)


def with_explanation(row: dict) -> dict:
    return {**row, "score_explanation": SCORE_EXPLANATION, "disclaimer": AI_DISCLAIMER}


def analysis_markdown(row: dict, resume_name: str) -> str:
    r = row["result"]
    lines = [
        "# InterviewOS resume analysis",
        "",
        f"- Resume: {resume_name}",
        f"- Target role: {row['target_role']}",
        f"- Generated: {row['created_at']}",
        f"- Practice score: {row['overall_score']}/100",
        "",
        f"> {SCORE_EXPLANATION}",
        f"> {AI_DISCLAIMER}",
        "",
        "## Overall assessment",
        r["overall_assessment"],
        "",
        "## Section scores",
        "| Section | Score (0-10) | Weight | Rationale |",
        "|---|---|---|---|",
    ]
    for s in r["section_scores"]:
        w = RESUME_SECTION_WEIGHTS.get(s["section"], 0)
        lines.append(f"| {s['section'].replace('_', ' ')} | {s['score']} | {int(w * 100)}% | {s['rationale'].replace('|', '/')} |")

    def bullets(title: str, items: list[str]) -> None:
        lines.extend(["", f"## {title}", *(f"- {i}" for i in items or ["None"])])

    bullets("Strengths", r["strengths"])
    bullets("Weaknesses", r["weaknesses"])
    bullets("Missing or underrepresented skills", [f"{m['skill']} ({m['importance']}): {m['reason']}" for m in r["missing_skills"]])
    bullets("ATS-related formatting issues", r["ats_issues"])
    lines.extend(["", "## Section-by-section suggestions"])
    for s in r["section_suggestions"]:
        lines.append(f"### {s['section'].replace('_', ' ').title()}")
        lines.extend(f"- {x}" for x in s["suggestions"])
    lines.extend(["", "## Suggested bullet improvements"])
    for b in r["bullet_rewrites"]:
        lines.extend([f"- **Original:** {b['original']}", f"  - **Improved:** {b['improved']}", f"  - _Why:_ {b['why']}"])
    bullets("Recommended projects", [f"{p['title']}: {p['description']} ({', '.join(p['skills'])})" for p in r["recommended_projects"]])
    bullets("Recommended certifications", [f"{c['name']} ({c['provider']}): {c['reason']}" for c in r["recommended_certifications"]])
    bullets("Interview questions from your resume", [f"{q['question']} _(based on: {q['based_on']})_" for q in r["interview_questions"]])
    jd = r["jd_comparison"]
    lines.extend(["", "## Job description comparison"])
    if jd["provided"]:
        lines.append(jd["summary"])
        bullets("Matched requirements", jd["matched_requirements"])
        bullets("Missing requirements", jd["missing_requirements"])
    else:
        lines.append("No job description was provided for this analysis.")
    return "\n".join(lines) + "\n"
