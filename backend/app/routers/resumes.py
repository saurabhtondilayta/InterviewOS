from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import PlainTextResponse

from ..auth import RequestContext, get_ctx
from ..config import get_settings
from ..db import user_storage
from ..errors import NotFoundError, ValidationFailed
from ..schemas import ResumeAnalysisRequest
from ..services import resume_service as svc

router = APIRouter(prefix="/api", tags=["resumes"])


@router.post("/resumes", status_code=201)
async def upload(file: UploadFile = File(...), ctx: RequestContext = Depends(get_ctx)) -> dict:
    limit = get_settings().max_resume_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise ValidationFailed(f"Files must be {limit // (1024 * 1024)} MB or smaller.", code="file_too_large")
    return svc.upload_resume(ctx, file.filename or "resume", data)


@router.get("/resumes")
def list_resumes(ctx: RequestContext = Depends(get_ctx)) -> list[dict]:
    rows = (
        ctx.db.table("resumes")
        .select(
            "id, original_filename, mime_type, size_bytes, page_count, is_primary, created_at, resume_analyses(id, target_role, overall_score, created_at)"
        )
        .eq("user_id", ctx.user_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    for r in rows:
        r["resume_analyses"].sort(key=lambda a: a["created_at"], reverse=True)
    return rows


@router.get("/resumes/{resume_id}")
def get_resume(resume_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return svc.public_resume(svc.get_resume(ctx, str(resume_id)))


@router.post("/resumes/{resume_id}/primary")
def make_primary(resume_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    svc.get_resume(ctx, str(resume_id))
    ctx.db.table("resumes").update({"is_primary": False}).eq("user_id", ctx.user_id).eq("is_primary", True).execute()
    ctx.db.table("resumes").update({"is_primary": True}).eq("id", str(resume_id)).execute()
    return {"ok": True}


@router.get("/resumes/{resume_id}/download-url")
def download_url(resume_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    r = svc.get_resume(ctx, str(resume_id))
    s = get_settings()
    signed = (
        user_storage(ctx.user.access_token)
        .from_(s.resume_bucket)
        .create_signed_url(r["storage_path"], s.signed_url_ttl_seconds, {"download": r["original_filename"]})
    )
    if isinstance(signed, dict):
        url = signed.get("signedURL") or signed.get("signedUrl")
    else:
        url = getattr(signed, "signed_url", None)
    if not url:
        raise NotFoundError("Could not create a download link for this file.")
    if url.startswith("/"):
        url = f"{s.supabase_url}/storage/v1{url}"
    return {"url": url, "expires_in": s.signed_url_ttl_seconds}


@router.delete("/resumes/{resume_id}", status_code=204)
def delete_resume(resume_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> None:
    r = svc.get_resume(ctx, str(resume_id))
    user_storage(ctx.user.access_token).from_(get_settings().resume_bucket).remove([r["storage_path"]])
    ctx.db.table("resumes").delete().eq("id", str(resume_id)).execute()


@router.post("/resumes/{resume_id}/analyses", status_code=201)
def analyze(resume_id: UUID, body: ResumeAnalysisRequest, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return svc.analyze_resume(ctx, str(resume_id), body.target_role, body.job_listing_id, body.job_description)


@router.get("/resume-analyses")
def list_analyses(ctx: RequestContext = Depends(get_ctx)) -> list[dict]:
    return (
        ctx.db.table("resume_analyses")
        .select("id, resume_id, target_role, overall_score, created_at, resumes(original_filename)")
        .eq("user_id", ctx.user_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def _analysis(ctx: RequestContext, analysis_id: str) -> dict:
    rows = ctx.db.table("resume_analyses").select("*, resumes(original_filename)").eq("id", analysis_id).limit(1).execute().data
    if not rows:
        raise NotFoundError("Analysis not found.")
    return rows[0]


@router.get("/resume-analyses/{analysis_id}")
def get_analysis(analysis_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return svc.with_explanation(_analysis(ctx, str(analysis_id)))


@router.get("/resume-analyses/{analysis_id}/report.md", response_class=PlainTextResponse)
def analysis_report(analysis_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> PlainTextResponse:
    a = _analysis(ctx, str(analysis_id))
    name = (a.get("resumes") or {}).get("original_filename", "resume")
    return PlainTextResponse(
        svc.analysis_markdown(a, name),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="resume-analysis-{str(analysis_id)[:8]}.md"'},
    )


@router.delete("/resume-analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> None:
    _analysis(ctx, str(analysis_id))
    ctx.db.table("resume_analyses").delete().eq("id", str(analysis_id)).execute()
