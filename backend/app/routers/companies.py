from uuid import UUID

from fastapi import APIRouter, Depends, Query

from ..ai import prompts
from ..ai.client import AI_DISCLAIMER, get_ai
from ..ai.schemas import RolePrepAI
from ..auth import RequestContext, get_ctx
from ..errors import NotFoundError, ValidationFailed
from ..schemas import RolePrepRequest, SavedJobCreate
from ..services import context as cctx
from ..services.companies import verified_company_context

router = APIRouter(prefix="/api", tags=["companies"])


@router.get("/companies")
def list_companies(q: str | None = Query(default=None, max_length=80), ctx: RequestContext = Depends(get_ctx)) -> list[dict]:
    query = (
        ctx.db.table("companies")
        .select("id, name, slug, industry, official_website, careers_url, last_verified_at, job_listings(count)")
        .order("name")
    )
    if q:
        safe = q.replace("%", "").replace(",", " ").replace("*", "").strip()
        if safe:
            query = query.ilike("name", f"%{safe}%")
    return query.execute().data or []


@router.get("/companies/{slug}")
def get_company(slug: str, ctx: RequestContext = Depends(get_ctx)) -> dict:
    rows = ctx.db.table("companies").select("*, company_sources(*)").eq("slug", slug).limit(1).execute().data
    if not rows:
        raise NotFoundError("Company not found.")
    company = rows[0]
    company.pop("job_board_token", None)
    listings = (
        ctx.db.table("job_listings")
        .select(
            "id, title, location, employment_type, experience_min, experience_max, required_skills, source_url, posted_at, last_verified_at, status, job_role_id, job_roles(title, slug)"
        )
        .eq("company_id", company["id"])
        .neq("status", "closed")
        .order("last_verified_at", desc=True)
        .limit(200)
        .execute()
        .data
        or []
    )
    return {"company": company, "listings": listings}


@router.get("/job-listings/{listing_id}")
def get_listing(listing_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    rows = (
        ctx.db.table("job_listings")
        .select("*, companies(name, slug), job_roles(id, title, slug)")
        .eq("id", str(listing_id))
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise NotFoundError("Job listing not found.")
    return rows[0]


@router.get("/job-roles")
def list_roles(ctx: RequestContext = Depends(get_ctx)) -> list[dict]:
    return ctx.db.table("job_roles").select("*").order("family").order("title").execute().data or []


@router.post("/role-prep")
def role_prep(body: RolePrepRequest, ctx: RequestContext = Depends(get_ctx)) -> dict:
    roles = ctx.db.table("job_roles").select("title, competencies, typical_skills").eq("id", body.job_role_id).limit(1).execute().data
    if not roles:
        raise NotFoundError("Job role not found.")
    role = roles[0]
    if body.job_listing_id and not body.company_id:
        raise ValidationFailed("A job listing must be used together with its company.")
    company_context, specific = verified_company_context(ctx.db, body.company_id, body.job_listing_id)
    candidate = cctx.candidate_context(ctx.db, ctx.user_id)
    result, model = get_ai().structured(
        prompts.role_preparation(
            role_title=role["title"],
            competencies=role["competencies"],
            candidate_context=candidate,
            company_context=company_context,
        ),
        RolePrepAI,
        user_id=ctx.user_id,
        feature="role_prep",
        temperature=0.5,
    )
    return {
        **result.model_dump(),
        "basis": "verified_listing" if specific else "general_role",
        "basis_note": (
            "Based on a verified job listing from the company's official source plus a general role framework."
            if specific
            else "General role-based practice. These are not official company interview questions."
        ),
        "model": model,
        "disclaimer": AI_DISCLAIMER,
    }


# --- saved jobs ------------------------------------------------------------
@router.get("/saved-jobs")
def list_saved(ctx: RequestContext = Depends(get_ctx)) -> list[dict]:
    return (
        ctx.db.table("saved_jobs")
        .select("*, companies(name, slug), job_roles(title, slug), job_listings(title, source_url, status)")
        .eq("user_id", ctx.user_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


@router.post("/saved-jobs", status_code=201)
def save_job(body: SavedJobCreate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    if not (body.company_id or body.job_role_id or body.job_listing_id):
        raise ValidationFailed("Choose a company, role or listing to save.")
    row = body.model_dump() | {"user_id": ctx.user_id}
    return ctx.db.table("saved_jobs").insert(row).execute().data[0]


@router.delete("/saved-jobs/{saved_id}", status_code=204)
def delete_saved(saved_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> None:
    ctx.db.table("saved_jobs").delete().eq("id", str(saved_id)).execute()
