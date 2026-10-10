"""Request schemas for the HTTP API (validated by FastAPI/Pydantic)."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

current_year = date.today().year


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _clean_list(values: list[str], max_items: int, max_len: int = 80) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for v in values:
        v = v.strip()
        if v and len(v) <= max_len and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out[:max_items]


class Project(_In):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1500)
    technologies: list[str] = Field(default_factory=list, max_length=20)
    link: HttpUrl | None = None


class Internship(_In):
    organization: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=120)
    start: str | None = Field(default=None, max_length=20)
    end: str | None = Field(default=None, max_length=20)
    description: str = Field(default="", max_length=1500)


class Certification(_In):
    name: str = Field(min_length=1, max_length=160)
    issuer: str | None = Field(default=None, max_length=120)
    year: int | None = Field(default=None, ge=1990, le=current_year + 1)


class ProfileUpdate(_In):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    college: str | None = Field(default=None, max_length=200)
    degree: str | None = Field(default=None, max_length=120)
    branch: str | None = Field(default=None, max_length=120)
    current_year: int | None = Field(default=None, ge=1, le=6)
    graduation_year: int | None = Field(default=None, ge=1990, le=2100)
    preferred_role: str | None = Field(default=None, max_length=120)
    years_experience: float | None = Field(default=None, ge=0, le=50)
    current_education: str | None = Field(default=None, max_length=300)
    programming_languages: list[str] | None = None
    projects: list[Project] | None = Field(default=None, max_length=15)
    internships: list[Internship] | None = Field(default=None, max_length=10)
    certifications: list[Certification] | None = Field(default=None, max_length=20)
    preferred_companies: list[str] | None = None
    target_roles: list[str] | None = None
    interview_experience: str | None = Field(default=None, max_length=2000)
    improvement_areas: list[str] | None = None
    weekly_study_hours: int | None = Field(default=None, ge=1, le=80)
    onboarding_completed: bool | None = None

    @field_validator("programming_languages", "preferred_companies", "target_roles", "improvement_areas")
    @classmethod
    def clean_lists(cls, v: list[str] | None) -> list[str] | None:
        return None if v is None else _clean_list(v, 25)


class SkillsUpdate(_In):
    skills: list[str] = Field(max_length=60)

    @field_validator("skills")
    @classmethod
    def clean(cls, v: list[str]) -> list[str]:
        # Commas, quotes and parentheses would break PostgREST list filters.
        return _clean_list([s.translate(str.maketrans("", "", ',()"')) for s in v], 60, 60)


class ResumeAnalysisRequest(_In):
    target_role: str = Field(min_length=2, max_length=120)
    job_listing_id: str | None = None
    job_description: str | None = Field(default=None, max_length=20000)


InterviewTypeLit = Literal["hr", "technical", "resume", "coding", "behavioral", "system_design", "company", "full"]


class InterviewCreate(_In):
    company_id: str | None = None
    job_role_id: str | None = None
    job_listing_id: str | None = None
    resume_id: str | None = None
    role_title: str | None = Field(default=None, max_length=120)
    interview_type: InterviewTypeLit
    experience_level: Literal["fresher", "junior", "mid", "senior"]
    difficulty: int = Field(ge=1, le=5)
    duration_minutes: int = Field(ge=5, le=120)
    topics: list[str] = Field(default_factory=list, max_length=12)
    answer_mode: Literal["voice", "text"] = "text"

    @field_validator("topics")
    @classmethod
    def clean_topics(cls, v: list[str]) -> list[str]:
        return _clean_list(v, 12, 80)


class CodingPracticeCreate(_In):
    job_role_id: str | None = None
    role_title: str | None = Field(default=None, max_length=120)
    topic: str = Field(min_length=2, max_length=80)
    difficulty: int = Field(ge=1, le=5)
    experience_level: Literal["fresher", "junior", "mid", "senior"] = "fresher"


class AnswerSubmit(_In):
    answer_text: str = Field(max_length=20000)
    answer_mode: Literal["voice", "text"] = "text"
    duration_seconds: int | None = Field(default=None, ge=0, le=7200)
    code_language: str | None = Field(default=None, max_length=30)


class SpeakRequest(_In):
    # Kept short: long audio responses would exceed hosting response-size limits.
    text: str = Field(min_length=1, max_length=900)


class ChatMessageIn(_In):
    conversation_id: str | None = None
    content: str = Field(min_length=1, max_length=4000)


class ConversationRename(_In):
    title: str = Field(min_length=1, max_length=120)


class LearningPlanCreate(_In):
    duration_days: Literal[7, 30]
    daily_minutes: int = Field(ge=15, le=600)
    goals: str | None = Field(default=None, max_length=1000)


class TaskUpdate(_In):
    completed: bool


class RolePrepRequest(_In):
    job_role_id: str
    company_id: str | None = None
    job_listing_id: str | None = None


class SavedJobCreate(_In):
    company_id: str | None = None
    job_role_id: str | None = None
    job_listing_id: str | None = None
    notes: str | None = Field(default=None, max_length=1000)


# --- admin ---------------------------------------------------------------
class CompanyUpsert(_In):
    name: str = Field(min_length=2, max_length=120)
    slug: str = Field(pattern=r"^[a-z0-9-]+$", max_length=60)
    official_website: HttpUrl
    careers_url: HttpUrl | None = None
    description: str | None = Field(default=None, max_length=2000)
    industry: str | None = Field(default=None, max_length=120)
    headquarters: str | None = Field(default=None, max_length=120)
    job_board_provider: Literal["greenhouse", "lever"] | None = None
    job_board_token: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]+$", max_length=80)


class ManualListing(_In):
    title: str = Field(min_length=2, max_length=200)
    source_url: HttpUrl
    location: str | None = Field(default=None, max_length=200)
    employment_type: str | None = Field(default=None, max_length=60)
    description_text: str = Field(min_length=50, max_length=20000)
    job_role_id: str | None = None
    posted_at: date | None = None


class QuestionBankCreate(_In):
    job_role_id: str | None = None
    topic: str = Field(min_length=2, max_length=120)
    kind: Literal["technical", "behavioral", "hr", "coding", "system_design", "resume"]
    difficulty: int = Field(ge=1, le=5)
    question_text: str = Field(min_length=10, max_length=4000)
    expected_points: list[str] = Field(default_factory=list, max_length=10)
    source_note: str | None = Field(default=None, max_length=500)
