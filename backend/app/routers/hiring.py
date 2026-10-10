"""Company hiring API: HR (company members) and candidate (invited student) endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends

from ..auth import RequestContext, get_ctx
from ..schemas import (
    AssessmentCreate,
    AssessmentUpdate,
    InvitationAccept,
    InvitationClaim,
    InvitationUpdate,
    InviteRequest,
    LiveFeedback,
    OrgCreate,
    OrgMemberAdd,
    ProctorBatch,
)
from ..services import hiring

router = APIRouter(prefix="/api", tags=["hiring"])


# --- company (HR) -----------------------------------------------------------
@router.get("/org")
def get_org(ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.org_overview(ctx)


@router.post("/org", status_code=201)
def create_org(body: OrgCreate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    hiring.create_org(ctx, body.name, str(body.website) if body.website else None, body.industry)
    return hiring.org_overview(ctx)


@router.post("/org/members", status_code=201)
def add_member(body: OrgMemberAdd, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.add_member(ctx, body.email, body.role)


@router.get("/org/assessments")
def list_assessments(ctx: RequestContext = Depends(get_ctx)) -> list[dict]:
    return hiring.list_assessments(ctx)


@router.post("/org/assessments", status_code=201)
def create_assessment(body: AssessmentCreate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.create_assessment(ctx, body.model_dump())


@router.get("/org/assessments/{assessment_id}")
def get_assessment(assessment_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.assessment_detail(ctx, str(assessment_id))


@router.patch("/org/assessments/{assessment_id}")
def update_assessment(assessment_id: UUID, body: AssessmentUpdate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.update_assessment(ctx, str(assessment_id), body.model_dump(exclude_unset=True))


@router.post("/org/assessments/{assessment_id}/invitations", status_code=201)
def invite(assessment_id: UUID, body: InviteRequest, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.invite(ctx, str(assessment_id), body.emails, body.scheduled_at)


@router.get("/org/invitations/{invitation_id}")
def candidate_report(invitation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.candidate_report(ctx, str(invitation_id))


@router.patch("/org/invitations/{invitation_id}")
def update_invitation(invitation_id: UUID, body: InvitationUpdate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.update_invitation(ctx, str(invitation_id), body.model_dump(exclude_unset=True))


@router.delete("/org/invitations/{invitation_id}", status_code=204)
def cancel_invitation(invitation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> None:
    hiring.cancel_invitation(ctx, str(invitation_id))


@router.post("/org/invitations/{invitation_id}/suggested-questions")
def suggested_questions(invitation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.suggest_questions(ctx, str(invitation_id))


@router.get("/org/invitations/{invitation_id}/live")
def hr_live(invitation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.hr_live(ctx, str(invitation_id))


@router.post("/org/invitations/{invitation_id}/live/start", status_code=204)
def live_start(invitation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> None:
    hiring.live_start(ctx, str(invitation_id))


@router.post("/org/invitations/{invitation_id}/live/end")
def live_end(invitation_id: UUID, body: LiveFeedback, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.live_end(ctx, str(invitation_id), body.model_dump())


# --- candidate ----------------------------------------------------------------
@router.get("/invitations")
def my_invitations(ctx: RequestContext = Depends(get_ctx)) -> list[dict]:
    return hiring.my_invitations(ctx)


@router.post("/invitations/claim")
def claim(body: InvitationClaim, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.claim(ctx, body.token)


@router.get("/invitations/{invitation_id}")
def my_invitation(invitation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.get_my_invitation(ctx, str(invitation_id))


@router.post("/invitations/{invitation_id}/accept")
def accept(invitation_id: UUID, body: InvitationAccept, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.accept(ctx, str(invitation_id), body.share_resume)


@router.post("/invitations/{invitation_id}/decline")
def decline(invitation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.decline(ctx, str(invitation_id))


@router.post("/invitations/{invitation_id}/start")
def start(invitation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.start_ai(ctx, str(invitation_id))


@router.get("/invitations/{invitation_id}/live")
def candidate_live(invitation_id: UUID, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.candidate_live(ctx, str(invitation_id))


@router.get("/apply/{public_token}")
def apply_preview(public_token: str, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.apply_preview(ctx, public_token)


@router.post("/apply/{public_token}", status_code=201)
def apply(public_token: str, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.apply(ctx, public_token)


# --- proctoring (candidate's browser) -----------------------------------------
@router.post("/proctoring/{invitation_id}/events")
def proctoring_events(invitation_id: UUID, body: ProctorBatch, ctx: RequestContext = Depends(get_ctx)) -> dict:
    return hiring.record_proctoring(ctx, str(invitation_id), [e.model_dump() for e in body.events])
