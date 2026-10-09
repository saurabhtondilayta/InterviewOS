from fastapi import APIRouter, Depends

from ..auth import RequestContext, get_ctx
from ..errors import NotFoundError
from ..schemas import ProfileUpdate, SkillsUpdate
from ..services import context as cctx

router = APIRouter(prefix="/api/profile", tags=["profile"])

# Fields counted for the profile-completion indicator.
_COMPLETION_FIELDS = [
    "full_name",
    "college",
    "degree",
    "branch",
    "current_year",
    "graduation_year",
    "preferred_role",
    "current_education",
    "programming_languages",
    "projects",
    "internships",
    "certifications",
    "preferred_companies",
    "target_roles",
    "interview_experience",
    "improvement_areas",
    "weekly_study_hours",
]


def _completion(profile: dict, skills: list[str]) -> dict:
    filled = [f for f in _COMPLETION_FIELDS if profile.get(f) not in (None, "", [], {})]
    missing = [f for f in _COMPLETION_FIELDS if f not in filled]
    total = len(_COMPLETION_FIELDS) + 1
    done = len(filled) + (1 if skills else 0)
    if not skills:
        missing.append("skills")
    return {"percent": round(done * 100 / total), "missing": missing}


def _profile_payload(ctx: RequestContext) -> dict:
    p = cctx.load_profile(ctx.db, ctx.user_id)
    if not p:
        raise NotFoundError("Your profile has not been created yet. Make sure your email is verified.", code="profile_missing")
    skills = cctx.load_skills(ctx.db, ctx.user_id)
    is_admin = bool(ctx.db.table("admin_users").select("user_id").eq("user_id", ctx.user_id).execute().data)
    return {"profile": p, "skills": skills, "completion": _completion(p, skills), "is_admin": is_admin}


@router.get("")
def get_profile(ctx: RequestContext = Depends(get_ctx)) -> dict:
    return _profile_payload(ctx)


@router.patch("")
def update_profile(body: ProfileUpdate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    changes = body.model_dump(exclude_unset=True, mode="json")
    if changes:
        # Runs as the user: RLS + column grants restrict what can be changed.
        ctx.db.table("profiles").update(changes).eq("id", ctx.user_id).execute()
    return _profile_payload(ctx)


@router.put("/skills")
def replace_skills(body: SkillsUpdate, ctx: RequestContext = Depends(get_ctx)) -> dict:
    names = body.skills
    if names:
        # The shared skills vocabulary is written with the service role.
        ctx.admin.table("skills").upsert([{"name": n} for n in names], on_conflict="name", ignore_duplicates=True).execute()
        ids = ctx.db.table("skills").select("id, name").in_("name", names).execute().data or []
    else:
        ids = []
    ctx.db.table("user_skills").delete().eq("user_id", ctx.user_id).eq("source", "profile").execute()
    if ids:
        ctx.db.table("user_skills").upsert(
            [{"user_id": ctx.user_id, "skill_id": r["id"], "source": "profile"} for r in ids],
            on_conflict="user_id,skill_id",
            ignore_duplicates=True,
        ).execute()
    return _profile_payload(ctx)
