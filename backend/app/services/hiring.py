"""Company hiring: organisations, assessments, invitations, live interviews and proctoring.

Every function checks access itself (company membership for HR, invitation ownership for
candidates) and then uses the service-role client. HR-only fields (notes, decision, integrity
score, proctoring) are never included in what a candidate receives.
"""

import base64
import binascii
import uuid
from datetime import UTC, datetime

from ..ai import prompts
from ..ai.client import get_ai
from ..ai.schemas import RolePrepAI
from ..auth import RequestContext
from ..config import get_settings
from ..db import admin_storage
from ..errors import ConflictError, ForbiddenError, NotFoundError, ValidationFailed
from . import context as cctx
from . import mailer, proctoring
from .interview import engine


def _now() -> str:
    return datetime.now(UTC).isoformat()


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------
def membership(ctx: RequestContext) -> dict | None:
    rows = (
        ctx.admin.table("org_members")
        .select("org_id, role, organizations(id, name, website, industry, created_at)")
        .eq("user_id", ctx.user_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def require_member(ctx: RequestContext, *, admin_role: bool = False) -> dict:
    m = membership(ctx)
    if not m:
        raise ForbiddenError("This page is for company accounts. Create or join a company first.", code="not_company_member")
    if admin_role and m["role"] not in ("owner", "admin"):
        raise ForbiddenError("Only company owners and admins can do this.")
    return m


def create_org(ctx: RequestContext, name: str, website: str | None, industry: str | None) -> dict:
    if membership(ctx):
        raise ConflictError("You already belong to a company.")
    org = (
        ctx.admin.table("organizations")
        .insert({"name": name, "website": website, "industry": industry, "created_by": ctx.user_id})
        .execute()
        .data[0]
    )
    ctx.admin.table("org_members").insert({"org_id": org["id"], "user_id": ctx.user_id, "role": "owner"}).execute()
    ctx.admin.table("profiles").update({"account_type": "recruiter", "onboarding_completed": True}).eq("id", ctx.user_id).execute()
    return org


def org_overview(ctx: RequestContext) -> dict:
    m = require_member(ctx)
    members = (
        ctx.admin.table("org_members")
        .select("user_id, role, created_at, profiles(full_name, email, designation)")
        .eq("org_id", m["org_id"])
        .execute()
        .data
        or []
    )
    return {"org": m["organizations"], "role": m["role"], "members": members}


def add_member(ctx: RequestContext, email: str, role: str) -> dict:
    m = require_member(ctx, admin_role=True)
    rows = ctx.admin.table("profiles").select("id, full_name, account_type").eq("email", email.strip().lower()).limit(1).execute().data
    if not rows:
        raise NotFoundError("No InterviewOS account uses that email. Ask them to sign up as Company HR first.")
    if ctx.admin.table("org_members").select("org_id").eq("user_id", rows[0]["id"]).execute().data:
        raise ConflictError("That person already belongs to a company.")
    ctx.admin.table("org_members").insert({"org_id": m["org_id"], "user_id": rows[0]["id"], "role": role}).execute()
    ctx.admin.table("profiles").update({"account_type": "recruiter", "onboarding_completed": True}).eq("id", rows[0]["id"]).execute()
    return org_overview(ctx)


# ---------------------------------------------------------------------------
# Assessments (HR)
# ---------------------------------------------------------------------------
def _assessment(ctx: RequestContext, assessment_id: str, org_id: str) -> dict:
    rows = ctx.admin.table("assessments").select("*").eq("id", assessment_id).eq("org_id", org_id).limit(1).execute().data
    if not rows:
        raise NotFoundError("Assessment not found.")
    return rows[0]


def list_assessments(ctx: RequestContext) -> list[dict]:
    m = require_member(ctx)
    rows = ctx.admin.table("assessments").select("*").eq("org_id", m["org_id"]).order("created_at", desc=True).execute().data or []
    invs = ctx.admin.table("assessment_invitations").select("assessment_id, status").eq("org_id", m["org_id"]).execute().data or []
    for a in rows:
        mine = [i for i in invs if i["assessment_id"] == a["id"]]
        a["counts"] = {
            "total": len(mine),
            "completed": sum(1 for i in mine if i["status"] == "completed"),
            "pending": sum(1 for i in mine if i["status"] in ("invited", "accepted", "in_progress")),
        }
    return rows


def create_assessment(ctx: RequestContext, data: dict) -> dict:
    m = require_member(ctx)
    if data.get("job_role_id") and not ctx.admin.table("job_roles").select("id").eq("id", data["job_role_id"]).execute().data:
        raise NotFoundError("Job role not found.")
    row = {**data, "org_id": m["org_id"], "created_by": ctx.user_id}
    return ctx.admin.table("assessments").insert(row).execute().data[0]


def update_assessment(ctx: RequestContext, assessment_id: str, changes: dict) -> dict:
    m = require_member(ctx)
    _assessment(ctx, assessment_id, m["org_id"])
    if changes:
        ctx.admin.table("assessments").update(changes).eq("id", assessment_id).execute()
    return assessment_detail(ctx, assessment_id)


def assessment_detail(ctx: RequestContext, assessment_id: str) -> dict:
    m = require_member(ctx)
    a = _assessment(ctx, assessment_id, m["org_id"])
    invs = (
        ctx.admin.table("assessment_invitations")
        .select(
            "id, candidate_email, candidate_user_id, status, scheduled_at, decision, integrity_score, created_at, completed_at, session_id, "
            "profiles!assessment_invitations_candidate_user_id_fkey(full_name), interview_sessions!assessment_invitations_session_id_fkey(interview_reports(overall_score))"
        )
        .eq("assessment_id", assessment_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    for i in invs:
        sess = i.pop("interview_sessions", None) or {}
        reps = sess.get("interview_reports") if isinstance(sess, dict) else None
        rep = reps[0] if isinstance(reps, list) and reps else reps
        i["ai_score"] = (rep or {}).get("overall_score") if isinstance(rep, dict) else None
        i["candidate_name"] = (i.pop("profiles", None) or {}).get("full_name")
    s = get_settings()
    a["apply_link"] = f"{s.app_url.rstrip('/')}/apply/{a['public_token']}"
    return {"assessment": a, "invitations": invs, "org": m["organizations"]}


def invite(ctx: RequestContext, assessment_id: str, emails: list[str], scheduled_at: datetime | None) -> dict:
    m = require_member(ctx)
    a = _assessment(ctx, assessment_id, m["org_id"])
    if a["status"] != "open":
        raise ConflictError("This assessment is closed. Reopen it to invite candidates.")
    if a["mode"] == "live" and not scheduled_at:
        raise ValidationFailed("Choose a date and time for the live interview.")
    existing = {
        r["candidate_email"].lower()
        for r in ctx.admin.table("assessment_invitations").select("candidate_email").eq("assessment_id", assessment_id).execute().data or []
    }
    new_emails = [e for e in emails if e not in existing]
    profiles = {
        p["email"].lower(): p["id"]
        for p in (ctx.admin.table("profiles").select("id, email").in_("email", new_emails).execute().data or [] if new_emails else [])
    }
    rows = [
        {
            "assessment_id": assessment_id,
            "org_id": m["org_id"],
            "candidate_email": e,
            "candidate_user_id": profiles.get(e),
            "scheduled_at": scheduled_at.isoformat() if scheduled_at else None,
            "invited_by": ctx.user_id,
        }
        for e in new_emails
    ]
    created = ctx.admin.table("assessment_invitations").insert(rows).execute().data if rows else []

    s = get_settings()
    sent = 0
    for inv in created:
        link = f"{s.app_url.rstrip('/')}/invite/{inv['token']}"
        when = scheduled_at.strftime("%d %b %Y, %H:%M UTC") if scheduled_at else None
        subject, text, html = mailer.invitation_email(
            company=m["organizations"]["name"], assessment=a["title"], mode=a["mode"], link=link, scheduled=when
        )
        sent += 1 if mailer.send_email(inv["candidate_email"], subject, text, html) else 0
    return {
        "created": len(created),
        "skipped_existing": len(emails) - len(new_emails),
        "emails_sent": sent,
        "email_configured": mailer.smtp_configured(),
        "links": [{"email": i["candidate_email"], "link": f"{s.app_url.rstrip('/')}/invite/{i['token']}"} for i in created],
    }


def _invitation_for_org(ctx: RequestContext, invitation_id: str, org_id: str) -> dict:
    rows = ctx.admin.table("assessment_invitations").select("*").eq("id", invitation_id).eq("org_id", org_id).limit(1).execute().data
    if not rows:
        raise NotFoundError("Candidate not found.")
    return rows[0]


def update_invitation(ctx: RequestContext, invitation_id: str, changes: dict) -> dict:
    m = require_member(ctx)
    _invitation_for_org(ctx, invitation_id, m["org_id"])
    if "scheduled_at" in changes and changes["scheduled_at"]:
        changes["scheduled_at"] = changes["scheduled_at"].isoformat()
    if changes:
        ctx.admin.table("assessment_invitations").update(changes).eq("id", invitation_id).execute()
    return candidate_report(ctx, invitation_id)


def cancel_invitation(ctx: RequestContext, invitation_id: str) -> None:
    m = require_member(ctx)
    inv = _invitation_for_org(ctx, invitation_id, m["org_id"])
    if inv["status"] == "completed":
        raise ConflictError("A completed interview cannot be cancelled.")
    ctx.admin.table("assessment_invitations").update({"status": "cancelled"}).eq("id", invitation_id).execute()


def _signed(bucket: str, path: str, ttl: int = 600) -> str | None:
    try:
        res = admin_storage().from_(bucket).create_signed_url(path, ttl)
    except Exception:  # noqa: BLE001
        return None
    url = (res.get("signedURL") or res.get("signedUrl")) if isinstance(res, dict) else getattr(res, "signed_url", None)
    if url and url.startswith("/"):
        url = f"{get_settings().supabase_url}/storage/v1{url}"
    return url


def candidate_report(ctx: RequestContext, invitation_id: str) -> dict:
    """Everything HR needs about one candidate: profile, resume (if shared), AI interview, proctoring."""
    m = require_member(ctx)
    inv = _invitation_for_org(ctx, invitation_id, m["org_id"])
    a = _assessment(ctx, inv["assessment_id"], m["org_id"])
    s = get_settings()
    out: dict = {"invitation": inv, "assessment": a, "candidate": None, "resume": None, "interview": None, "proctoring": None}

    uid = inv.get("candidate_user_id")
    if uid:
        p = (
            ctx.admin.table("profiles")
            .select("full_name, email, college, degree, branch, graduation_year, preferred_role, years_experience")
            .eq("id", uid)
            .limit(1)
            .execute()
            .data
            or [None]
        )[0]
        out["candidate"] = {**(p or {}), "skills": cctx.load_skills(ctx.admin, uid)}
        if inv["share_resume"]:
            r = cctx.latest_resume(ctx.admin, uid)
            if r:
                path = (ctx.admin.table("resumes").select("storage_path").eq("id", r["id"]).execute().data or [{}])[0].get("storage_path")
                out["resume"] = {"filename": r["original_filename"], "url": _signed(s.resume_bucket, path) if path else None}

    if inv.get("session_id"):
        qs = engine._normalise(
            ctx.admin.table("interview_questions")
            .select(
                "sequence_no, topic, kind, difficulty, question_text, parent_question_id, interview_responses(answer_text, answer_mode), answer_evaluations(question_score, communication_score, dimension_scores, technical_scores, feedback, strengths, missing_concepts, incorrect_statements)"
            )
            .eq("session_id", inv["session_id"])
            .order("sequence_no")
            .execute()
            .data
            or []
        )
        report = (ctx.admin.table("interview_reports").select("*").eq("session_id", inv["session_id"]).limit(1).execute().data or [None])[0]
        sess = (
            ctx.admin.table("interview_sessions")
            .select("status, started_at, ended_at, answer_mode")
            .eq("id", inv["session_id"])
            .limit(1)
            .execute()
            .data
            or [None]
        )[0]
        out["interview"] = {
            "session": sess,
            "report": report,
            "questions": [
                {
                    "sequence_no": q["sequence_no"],
                    "topic": q["topic"],
                    "kind": q["kind"],
                    "difficulty": q["difficulty"],
                    "question_text": q["question_text"],
                    "is_follow_up": q.get("parent_question_id") is not None,
                    "response": (q["interview_responses"] or [None])[0],
                    "evaluation": (q["answer_evaluations"] or [None])[0],
                }
                for q in qs
            ],
        }

    events = ctx.admin.table("proctoring_events").select("*").eq("invitation_id", invitation_id).order("occurred_at").execute().data or []
    for e in events:
        if e.get("snapshot_path"):
            e["snapshot_url"] = _signed(s.proctoring_bucket, e["snapshot_path"])
    out["proctoring"] = {
        "enabled": a["proctoring_enabled"],
        "integrity_score": inv["integrity_score"],
        "summary": inv["proctoring_summary"],
        "events": events,
    }
    return out


def suggest_questions(ctx: RequestContext, invitation_id: str) -> dict:
    m = require_member(ctx)
    inv = _invitation_for_org(ctx, invitation_id, m["org_id"])
    a = _assessment(ctx, inv["assessment_id"], m["org_id"])
    competencies: list[dict] = []
    if a.get("job_role_id"):
        competencies = (ctx.admin.table("job_roles").select("competencies").eq("id", a["job_role_id"]).execute().data or [{}])[0].get(
            "competencies", []
        )
    candidate = {}
    if inv.get("candidate_user_id"):
        candidate = cctx.candidate_context(ctx.admin, inv["candidate_user_id"], include_performance=False)
        if inv["share_resume"]:
            summary = cctx.resume_summary_for_ai(ctx.admin, inv["candidate_user_id"])
            if summary:
                candidate["resume_excerpt"] = summary[:3000]
    result, _ = get_ai().structured(
        prompts.role_preparation(role_title=a["role_title"], competencies=competencies, candidate_context=candidate, company_context=None),
        RolePrepAI,
        user_id=ctx.user_id,
        feature="hr_suggest_questions",
        temperature=0.6,
    )
    return {
        "questions": [q.model_dump() for q in result.practice_questions],
        "focus_areas": result.focus_areas,
        "skill_gaps": result.skill_gaps,
    }


def ice_servers() -> list[dict]:
    s = get_settings()
    servers: list[dict] = [{"urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]}]
    if s.turn_urls:
        servers.append(
            {"urls": [u.strip() for u in s.turn_urls.split(",") if u.strip()], "username": s.turn_username, "credential": s.turn_credential}
        )
    return servers


def hr_live(ctx: RequestContext, invitation_id: str) -> dict:
    m = require_member(ctx)
    inv = _invitation_for_org(ctx, invitation_id, m["org_id"])
    a = _assessment(ctx, inv["assessment_id"], m["org_id"])
    if a["mode"] != "live":
        raise ConflictError("This assessment is an AI interview, not a live one.")
    name = None
    if inv.get("candidate_user_id"):
        name = (ctx.admin.table("profiles").select("full_name").eq("id", inv["candidate_user_id"]).execute().data or [{}])[0].get(
            "full_name"
        )
    return {
        "room_token": inv["room_token"],
        "role": "interviewer",
        "ice_servers": ice_servers(),
        "candidate_name": name or inv["candidate_email"],
        "assessment": {"title": a["title"], "role_title": a["role_title"], "job_role_id": a["job_role_id"]},
        "invitation": {
            "status": inv["status"],
            "scheduled_at": inv["scheduled_at"],
            "hr_feedback": inv["hr_feedback"],
            "share_resume": inv["share_resume"],
        },
    }


def live_start(ctx: RequestContext, invitation_id: str) -> None:
    m = require_member(ctx)
    inv = _invitation_for_org(ctx, invitation_id, m["org_id"])
    if inv["status"] in ("cancelled", "declined"):
        raise ConflictError("This invitation is no longer active.")
    changes = {"status": "in_progress"}
    if not inv.get("live_started_at"):
        changes["live_started_at"] = _now()
    ctx.admin.table("assessment_invitations").update(changes).eq("id", invitation_id).execute()


def live_end(ctx: RequestContext, invitation_id: str, feedback: dict) -> dict:
    m = require_member(ctx)
    _invitation_for_org(ctx, invitation_id, m["org_id"])
    ctx.admin.table("assessment_invitations").update(
        {"status": "completed", "live_ended_at": _now(), "completed_at": _now(), "hr_feedback": {**feedback, "interviewer_id": ctx.user_id}}
    ).eq("id", invitation_id).execute()
    return candidate_report(ctx, invitation_id)


# ---------------------------------------------------------------------------
# Candidate side
# ---------------------------------------------------------------------------
_CANDIDATE_FIELDS = "id, assessment_id, status, scheduled_at, consent_at, share_resume, session_id, created_at, completed_at, candidate_email, candidate_user_id"


def _public_assessment(a: dict) -> dict:
    keys = (
        "id",
        "title",
        "role_title",
        "description",
        "mode",
        "interview_type",
        "difficulty",
        "duration_minutes",
        "proctoring_enabled",
        "status",
    )
    return {k: a.get(k) for k in keys}


def _candidate_view(ctx: RequestContext, inv: dict) -> dict:
    a = (ctx.admin.table("assessments").select("*").eq("id", inv["assessment_id"]).execute().data or [{}])[0]
    org = (ctx.admin.table("organizations").select("name, website").eq("id", a.get("org_id")).execute().data or [{}])[0]
    view = {
        k: inv.get(k) for k in ("id", "status", "scheduled_at", "consent_at", "share_resume", "session_id", "created_at", "completed_at")
    }
    view["assessment"] = _public_assessment(a)
    view["company"] = org
    view["results_visible"] = bool(a.get("show_results_to_candidate"))
    return view


def my_invitations(ctx: RequestContext) -> list[dict]:
    email = ctx.user.email.lower()
    # Attach invitations sent to my email before I had an account.
    ctx.admin.table("assessment_invitations").update({"candidate_user_id": ctx.user_id}).eq("candidate_email", email).is_(
        "candidate_user_id", "null"
    ).execute()
    rows = (
        ctx.admin.table("assessment_invitations")
        .select(_CANDIDATE_FIELDS)
        .eq("candidate_user_id", ctx.user_id)
        .neq("status", "cancelled")
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [_candidate_view(ctx, r) for r in rows]


def _my_invitation(ctx: RequestContext, invitation_id: str) -> dict:
    rows = (
        ctx.admin.table("assessment_invitations")
        .select("*")
        .eq("id", invitation_id)
        .eq("candidate_user_id", ctx.user_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise NotFoundError("Invitation not found.")
    return rows[0]


def get_my_invitation(ctx: RequestContext, invitation_id: str) -> dict:
    return _candidate_view(ctx, _my_invitation(ctx, invitation_id))


def claim(ctx: RequestContext, token: str) -> dict:
    rows = ctx.admin.table("assessment_invitations").select("*").eq("token", token).limit(1).execute().data
    if not rows:
        raise NotFoundError("This invitation link is not valid.")
    inv = rows[0]
    if inv["candidate_user_id"] and inv["candidate_user_id"] != ctx.user_id:
        raise ForbiddenError("This invitation belongs to another account.")
    if inv["candidate_email"].lower() != ctx.user.email.lower():
        raise ForbiddenError(
            "This invitation was sent to a different email address. Log in with that address to open it.", code="wrong_account"
        )
    if not inv["candidate_user_id"]:
        ctx.admin.table("assessment_invitations").update({"candidate_user_id": ctx.user_id}).eq("id", inv["id"]).execute()
        inv["candidate_user_id"] = ctx.user_id
    return _candidate_view(ctx, inv)


def apply_preview(ctx: RequestContext, public_token: str) -> dict:
    rows = ctx.admin.table("assessments").select("*").eq("public_token", public_token).limit(1).execute().data
    if not rows or not rows[0]["accepting_applications"] or rows[0]["status"] != "open":
        raise NotFoundError("This application link is closed or not valid.")
    a = rows[0]
    org = (ctx.admin.table("organizations").select("name, website").eq("id", a["org_id"]).execute().data or [{}])[0]
    return {"assessment": _public_assessment(a), "company": org}


def apply(ctx: RequestContext, public_token: str) -> dict:
    preview = apply_preview(ctx, public_token)
    a_id = preview["assessment"]["id"]
    existing = (
        ctx.admin.table("assessment_invitations")
        .select("*")
        .eq("assessment_id", a_id)
        .eq("candidate_email", ctx.user.email.lower())
        .execute()
        .data
    )
    if existing:
        if not existing[0]["candidate_user_id"]:
            ctx.admin.table("assessment_invitations").update({"candidate_user_id": ctx.user_id}).eq("id", existing[0]["id"]).execute()
        return _candidate_view(ctx, existing[0])
    org_id = (ctx.admin.table("assessments").select("org_id").eq("id", a_id).execute().data or [{}])[0]["org_id"]
    inv = (
        ctx.admin.table("assessment_invitations")
        .insert({"assessment_id": a_id, "org_id": org_id, "candidate_email": ctx.user.email.lower(), "candidate_user_id": ctx.user_id})
        .execute()
        .data[0]
    )
    return _candidate_view(ctx, inv)


def accept(ctx: RequestContext, invitation_id: str, share_resume: bool) -> dict:
    inv = _my_invitation(ctx, invitation_id)
    if inv["status"] not in ("invited", "accepted"):
        raise ConflictError("This invitation can no longer be accepted.")
    ctx.admin.table("assessment_invitations").update({"status": "accepted", "consent_at": _now(), "share_resume": share_resume}).eq(
        "id", invitation_id
    ).execute()
    return get_my_invitation(ctx, invitation_id)


def decline(ctx: RequestContext, invitation_id: str) -> dict:
    inv = _my_invitation(ctx, invitation_id)
    if inv["status"] in ("in_progress", "completed"):
        raise ConflictError("This interview has already started.")
    ctx.admin.table("assessment_invitations").update({"status": "declined"}).eq("id", invitation_id).execute()
    return get_my_invitation(ctx, invitation_id)


def start_ai(ctx: RequestContext, invitation_id: str) -> dict:
    inv = _my_invitation(ctx, invitation_id)
    a = (ctx.admin.table("assessments").select("*").eq("id", inv["assessment_id"]).execute().data or [None])[0]
    if not a or a["mode"] != "ai":
        raise ConflictError("This is not an AI interview.")
    if a["status"] != "open":
        raise ConflictError("The company has closed this assessment.")
    if inv["status"] == "completed":
        raise ConflictError("You have already completed this interview.")
    if not inv.get("consent_at"):
        raise ValidationFailed("Accept the invitation and consent to the interview conditions first.", code="consent_required")
    if inv.get("session_id"):
        return {"session_id": inv["session_id"], "invitation_id": invitation_id}

    session = engine.create_session(
        ctx,
        {
            "job_role_id": a["job_role_id"],
            "role_title": a["role_title"],
            "interview_type": a["interview_type"],
            "experience_level": a["experience_level"],
            "difficulty": a["difficulty"],
            "duration_minutes": a["duration_minutes"],
            "topics": a["topics"],
            "answer_mode": "voice",
        },
    )
    ctx.admin.table("interview_sessions").update(
        {"assessment_invitation_id": invitation_id, "results_hidden": not a["show_results_to_candidate"]}
    ).eq("id", session["id"]).execute()
    ctx.admin.table("assessment_invitations").update({"session_id": session["id"], "status": "in_progress"}).eq(
        "id", invitation_id
    ).execute()
    return {"session_id": session["id"], "invitation_id": invitation_id}


def candidate_live(ctx: RequestContext, invitation_id: str) -> dict:
    inv = _my_invitation(ctx, invitation_id)
    a = (ctx.admin.table("assessments").select("*").eq("id", inv["assessment_id"]).execute().data or [None])[0]
    if not a or a["mode"] != "live":
        raise ConflictError("This is not a live interview.")
    if not inv.get("consent_at"):
        raise ValidationFailed("Accept the invitation and consent to the interview conditions first.", code="consent_required")
    if inv["status"] in ("completed", "cancelled", "declined"):
        raise ConflictError("This interview is no longer active.")
    org = (ctx.admin.table("organizations").select("name").eq("id", a["org_id"]).execute().data or [{}])[0]
    return {
        "room_token": inv["room_token"],
        "role": "candidate",
        "ice_servers": ice_servers(),
        "company": org.get("name"),
        "assessment": _public_assessment(a),
        "scheduled_at": inv["scheduled_at"],
        "status": inv["status"],
    }


# ---------------------------------------------------------------------------
# Proctoring ingestion (candidate's browser -> backend)
# ---------------------------------------------------------------------------
def record_proctoring(ctx: RequestContext, invitation_id: str, events: list[dict]) -> dict:
    inv = _my_invitation(ctx, invitation_id)
    if inv["status"] not in ("accepted", "in_progress"):
        raise ConflictError("Proctoring is only recorded during an active interview.")
    a = (ctx.admin.table("assessments").select("proctoring_enabled").eq("id", inv["assessment_id"]).execute().data or [{}])[0]
    if not a.get("proctoring_enabled"):
        return {"recorded": 0}

    s = get_settings()
    stored = (
        ctx.admin.table("proctoring_events")
        .select("id", count="exact", head=True)
        .eq("invitation_id", invitation_id)
        .not_.is_("snapshot_path", "null")
        .execute()
        .count
        or 0
    )
    rows = []
    for e in events:
        path = None
        if e.get("snapshot") and stored < s.max_snapshots_per_invitation and e["kind"] not in proctoring.INFO_KINDS:
            try:
                raw = base64.b64decode(e["snapshot"].split(",")[-1], validate=True)
            except (binascii.Error, ValueError):
                raw = b""
            if raw.startswith(b"\xff\xd8") and len(raw) <= 200_000:  # JPEG magic bytes
                path = f"{inv['org_id']}/{invitation_id}/{uuid.uuid4()}.jpg"
                admin_storage().from_(s.proctoring_bucket).upload(path, raw, {"content-type": "image/jpeg", "upsert": "false"})
                stored += 1
        detail = {k: v for k, v in (e.get("detail") or {}).items() if isinstance(v, (int, float, str, bool))}
        rows.append(
            {
                "invitation_id": invitation_id,
                "org_id": inv["org_id"],
                "candidate_user_id": ctx.user_id,
                "kind": e["kind"],
                "severity": e["severity"],
                "detail": dict(list(detail.items())[:10]),
                "snapshot_path": path,
                "occurred_at": e["occurred_at"].isoformat() if hasattr(e["occurred_at"], "isoformat") else e["occurred_at"],
            }
        )
    ctx.admin.table("proctoring_events").insert(rows).execute()

    all_events = ctx.admin.table("proctoring_events").select("kind").eq("invitation_id", invitation_id).execute().data or []
    score, summary = proctoring.summarize(all_events)
    ctx.admin.table("assessment_invitations").update({"integrity_score": score, "proctoring_summary": summary}).eq(
        "id", invitation_id
    ).execute()
    return {"recorded": len(rows)}


def mark_completed_for_session(admin, session: dict) -> None:
    """Called when an assessment interview ends."""
    inv_id = session.get("assessment_invitation_id")
    if inv_id:
        admin.table("assessment_invitations").update({"status": "completed", "completed_at": _now()}).eq("id", inv_id).neq(
            "status", "completed"
        ).execute()
