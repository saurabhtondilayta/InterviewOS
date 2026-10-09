"""Structured output schemas for every AI task.

The AI provider is asked to return JSON matching these models (``response_format=json_schema``)
and every response is validated with Pydantic before it is used or stored. Numeric scores
that drive the product (overall resume score, interview scores) are computed by our own
documented code from these validated fields - not taken verbatim from the model.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


Score10 = Field(ge=0, le=10)

# ---------------------------------------------------------------------------
# Resume analysis
# ---------------------------------------------------------------------------
ResumeSection = Literal[
    "structure",
    "education",
    "skills",
    "projects",
    "experience",
    "certifications",
    "keywords",
    "achievements",
    "ats_formatting",
    "role_alignment",
]


class SectionScore(_Strict):
    section: ResumeSection
    score: int = Score10
    rationale: str


class MissingSkill(_Strict):
    skill: str
    importance: Literal["high", "medium", "low"]
    reason: str


class SectionSuggestion(_Strict):
    section: ResumeSection
    suggestions: list[str]


class BulletRewrite(_Strict):
    original: str
    improved: str
    why: str


class ProjectIdea(_Strict):
    title: str
    description: str
    skills: list[str]


class CertificationIdea(_Strict):
    name: str
    provider: str
    reason: str


class ResumeQuestion(_Strict):
    question: str
    topic: str
    based_on: str


class JDComparison(_Strict):
    provided: bool
    matched_requirements: list[str]
    missing_requirements: list[str]
    summary: str


class ResumeAnalysisAI(_Strict):
    overall_assessment: str
    section_scores: list[SectionScore]
    strengths: list[str]
    weaknesses: list[str]
    missing_skills: list[MissingSkill]
    section_suggestions: list[SectionSuggestion]
    bullet_rewrites: list[BulletRewrite]
    recommended_projects: list[ProjectIdea]
    recommended_certifications: list[CertificationIdea]
    interview_questions: list[ResumeQuestion]
    ats_issues: list[str]
    jd_comparison: JDComparison
    detected_skills: list[str]


# ---------------------------------------------------------------------------
# Interview questions
# ---------------------------------------------------------------------------
QuestionKind = Literal["technical", "behavioral", "hr", "coding", "system_design", "resume"]


class CodingExample(_Strict):
    input: str
    output: str
    explanation: str | None


class QuestionDetails(_Strict):
    constraints: list[str] | None
    examples: list[CodingExample] | None
    function_signature: str | None
    hints: list[str] | None


class GeneratedQuestion(_Strict):
    question: str = Field(min_length=10)
    expected_points: list[str]
    kind: QuestionKind
    topic: str
    difficulty: int = Field(ge=1, le=5)
    details: QuestionDetails


# ---------------------------------------------------------------------------
# Answer evaluation
# ---------------------------------------------------------------------------
class DimensionScores(_Strict):
    relevance: int = Score10
    correctness: int = Score10
    depth: int = Score10
    communication: int = Score10
    problem_solving: int = Score10


class TechnicalCriterion(_Strict):
    criterion: str
    score: int = Score10
    rationale: str


class AnswerEvaluationAI(_Strict):
    dimension_scores: DimensionScores
    dimension_rationale: str
    # Only for coding / system design questions; empty list otherwise.
    technical_scores: list[TechnicalCriterion]
    feedback: str
    strengths: list[str]
    missing_concepts: list[str]
    incorrect_statements: list[str]
    needs_follow_up: bool
    follow_up_reason: str | None
    model_answer_outline: list[str]


# ---------------------------------------------------------------------------
# Reports and plans
# ---------------------------------------------------------------------------
class PracticeQuestion(_Strict):
    question: str
    topic: str


class InterviewReportAI(_Strict):
    overall_assessment: str
    strengths: list[str]
    weaknesses: list[str]
    communication_feedback: str
    problem_solving_observations: str
    topics_to_revise: list[str]
    recommended_practice: list[PracticeQuestion]
    next_steps: list[str]


TaskType = Literal["study", "practice", "mock_interview", "resume", "project", "revision"]


class PlanTask(_Strict):
    title: str
    description: str
    topic: str
    task_type: TaskType
    estimated_minutes: int = Field(ge=5, le=600)


class PlanDay(_Strict):
    day: int = Field(ge=1, le=30)
    tasks: list[PlanTask]


class LearningPlanAI(_Strict):
    title: str
    overview: str
    days: list[PlanDay]


# ---------------------------------------------------------------------------
# Company & role preparation
# ---------------------------------------------------------------------------
class RolePrepQuestion(_Strict):
    question: str
    topic: str
    kind: QuestionKind


class RolePrepAI(_Strict):
    focus_areas: list[str]
    skill_gaps: list[str]
    matched_strengths: list[str]
    practice_questions: list[RolePrepQuestion]
    preparation_tips: list[str]


class ConversationTitleAI(_Strict):
    title: str = Field(max_length=80)
