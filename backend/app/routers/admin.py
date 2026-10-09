"""Admin-only company data maintenance. Access requires a row in public.admin_users."""

from uuid import UUID

from fastapi import APIRouter, Depends

from ..auth import RequestContext, require_admin
from ..schemas import CompanyUpsert, ManualListing, QuestionBankCreate
from ..services import companies as company_svc

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/companies", status_code=201)
def upsert_company(body: CompanyUpsert, ctx: RequestContext = Depends(require_admin)) -> dict:
    row = body.model_dump(mode="json")
    return ctx.admin.table("companies").upsert(row, on_conflict="slug").execute().data[0]


@router.post("/companies/{company_id}/sync")
def sync_company(company_id: UUID, ctx: RequestContext = Depends(require_admin)) -> dict:
    return company_svc.sync_job_board(ctx.admin, str(company_id))


@router.post("/companies/{company_id}/listings", status_code=201)
def add_listing(company_id: UUID, body: ManualListing, ctx: RequestContext = Depends(require_admin)) -> dict:
    return company_svc.add_manual_listing(ctx.admin, str(company_id), body.model_dump(mode="json"))


@router.post("/refresh-listings")
def refresh(company_id: UUID | None = None, ctx: RequestContext = Depends(require_admin)) -> dict:
    return company_svc.refresh_listings(ctx.admin, str(company_id) if company_id else None)


@router.post("/question-bank", status_code=201)
def add_question(body: QuestionBankCreate, ctx: RequestContext = Depends(require_admin)) -> dict:
    return ctx.admin.table("question_bank").insert(body.model_dump()).execute().data[0]
