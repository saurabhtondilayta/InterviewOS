"""Interview session orchestration: create -> next question -> submit answer -> ... -> report.

Pattern used throughout: ownership is checked with the user-scoped (RLS) client `ctx.db`;
pipeline-owned rows (questions, evaluations, reports, session state) are then written with
the service-role client `ctx.admin`, always with user_id = ctx.user_id.
"""

import random
from datetime import UTC, datetime, timedelta

from ...ai import prompts
from ...ai.client import get_ai
from ...ai.schemas import AnswerEvaluationAI, GeneratedQuestion, InterviewReportAI
from ...auth import RequestContext
from ...errors import ConflictError, NotFoundError, ValidationFailed
from .. import context as cctx
from ..companies import verified_company_context
from . import adaptive, rubric

GRACE_MINUTES = 3

# When the candidate has a resume, this share of the plan is spent on questions about it.
RESUME_TOPIC = "Resume Deep-Dive"
RESUME_TOPIC_SHARE = 0.3
RESUME_BOOST_TYPES = {"technical", "full", "company", "behavioral", "system_design"}
# Probability of using an unused verified bank question (when one exists) instead of generating one.
BANK_SHARE = 0.55
# Problem patterns rotated for coding questions so repeated practice covers different techniques.
CODING_PATTERNS = [
    "hash maps / counting",
    "two pointers",
    "sliding window",
    "stack or monotonic stack",
    "binary search",
    "recursion / backtracking",
    "greedy choice",
    "dynamic programming",
    "BFS / DFS on a graph or grid",
    "binary trees",
    "heaps / priority queues",
    "string manipulation",
    "intervals / sorting",
    "prefix sums",
    "linked lists",
]


def _now() -> str:
    return datetime.now(UTC).isoformat()


def get_session(ctx: RequestContext, session_id: str) -> dict:
    rows = ctx.db.table("interview_sessions").select("*").eq("id", session_id).limit(1).execute().data
    if not rows:
        raise NotFoundError("Interview session not found.")
    return rows[0]


def public_question(q: dict) -> dict:
    """Question as shown to the candidate: grading guide (expected_points) is withheld."""
    details = q.get("details") or {}
    return {
        "id": q["id"],
        "sequence_no": q["sequence_no"],
        "topic": q["topic"],
        "kind": q["kind"],
        "difficulty": q["difficulty"],
        "question_text": q["question_text"],
        "is_follow_up": q.get("parent_question_id") is not None,
        "details": {k: v for k, v in details.items() if k != "hints" and v},
        "selection_reason": q["selection_reason"],
        "source": q["source"],
    }


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
def create_session(ctx: RequestContext, cfg: dict) -> dict:
    competencies: list[dict] = []
    role_title = (cfg.get("role_title") or "").strip()
    if cfg.get("job_role_id"):
        roles = ctx.db.table("job_roles").select("title, competencies").eq("id", cfg["job_role_id"]).limit(1).execute().data
        if not roles:
            raise NotFoundError("Job role not found.")
        competencies = roles[0]["competencies"]
        role_title = role_title or roles[0]["title"]
    if not role_title:
        raise ValidationFailed("Choose a job role or enter a role title.")

    _, company_specific = verified_company_context(ctx.db, cfg.get("company_id"), cfg.get("job_listing_id"))

    if cfg.get("resume_id"):
        if not cctx.latest_resume(ctx.db, ctx.user_id, cfg["resume_id"]):
            raise NotFoundError("Resume not found.")
    elif not cfg.get("is_practice"):
        # Use the candidate's primary/latest resume automatically when they have uploaded one.
        resume = cctx.latest_resume(ctx.db, ctx.user_id)
        if resume:
            cfg["resume_id"] = resume["id"]
        elif cfg["interview_type"] == "resume":
            raise ValidationFailed("Upload a resume before starting a resume-based interview.", code="resume_required")

    weak = cctx.weak_topics(ctx.db, ctx.user_id)
    plan_topics = adaptive.build_plan(cfg["interview_type"], competencies, cfg.get("topics"), weak)
    if cfg.get("resume_id") and not cfg.get("topics") and cfg["interview_type"] in RESUME_BOOST_TYPES:
        plan_topics = adaptive.add_resume_topic(plan_topics, RESUME_TOPIC, RESUME_TOPIC_SHARE)
    target = cfg.get("target_question_count") or adaptive.target_question_count(cfg["duration_minutes"], cfg["interview_type"])

    row = {
        "user_id": ctx.user_id,
        "company_id": cfg.get("company_id"),
        "job_role_id": cfg.get("job_role_id"),
        "job_listing_id": cfg.get("job_listing_id"),
        "resume_id": cfg.get("resume_id"),
        "role_title": role_title,
        "interview_type": cfg["interview_type"],
        "experience_level": cfg["experience_level"],
        "start_difficulty": cfg["difficulty"],
        "current_difficulty": cfg["difficulty"],
        "duration_minutes": cfg["duration_minutes"],
        "target_question_count": target,
        "topics": [t.topic for t in plan_topics],
        "answer_mode": cfg.get("answer_mode", "text"),
        "is_company_specific": company_specific,
        "is_practice": bool(cfg.get("is_practice")),
        "rubric_version": rubric.RUBRIC_VERSION,
        "plan": {
            "topics": [t.to_dict() for t in plan_topics],
            "state": {},
            "scores": [],
            "main_questions_asked": 0,
            "follow_ups_used": 0,
            "pending_follow_up": None,
            "weak_topics_used": weak,
        },
        "status": "configured",
    }
    return ctx.admin.table("interview_sessions").insert(row).execute().data[0]


# ---------------------------------------------------------------------------
# Next question
# ---------------------------------------------------------------------------
def _as_list(value: object) -> list[dict]:
    """PostgREST embeds a one-to-one relation (interview_responses.question_id is unique) as a
    single object or null, and one-to-many relations as arrays. Normalise both to lists."""
    if value is None:
        return []
    return value if isinstance(value, list) else [value]  # type: ignore[list-item]


def _normalise(rows: list[dict]) -> list[dict]:
    for r in rows:
        for key in ("interview_responses", "answer_evaluations"):
            if key in r:
                r[key] = _as_list(r[key])
    return rows


def _questions(ctx: RequestContext, session_id: str) -> list[dict]:
    # Read with the service role, filtered to the owner: evaluations of company assessments are
    # hidden from the candidate by RLS, but the engine still needs them. Callers have already
    # verified ownership of the session through get_session().
    return _normalise(
        ctx.admin.table("interview_questions")
        .select("*, interview_responses(id, answer_text), answer_evaluations(id, missing_concepts, follow_up_reason)")
        .eq("session_id", session_id)
        .eq("user_id", ctx.user_id)
        .order("sequence_no")
        .execute()
        .data
        or []
    )


def _time_up(session: dict) -> bool:
    if not session.get("started_at"):
        return False
    started = datetime.fromisoformat(session["started_at"].replace("Z", "+00:00"))
    return datetime.now(UTC) > started + timedelta(minutes=session["duration_minutes"] + GRACE_MINUTES)


def _pick_bank_question(ctx: RequestContext, topic: str, kind: str, difficulty: int) -> dict | None:
    """An unused verified bank question for the topic, preferring the exact difficulty, else +/-1."""
    rows = (
        ctx.admin.table("question_bank")
        .select("id, question_text, expected_points, difficulty")
        .eq("is_active", True)
        .ilike("topic", topic)
        .eq("kind", kind)
        .gte("difficulty", max(1, difficulty - 1))
        .lte("difficulty", min(5, difficulty + 1))
        .limit(200)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    used = {
        r["question_bank_id"]
        for r in ctx.db.table("interview_questions")
        .select("question_bank_id")
        .eq("user_id", ctx.user_id)
        .not_.is_("question_bank_id", "null")
        .execute()
        .data
        or []
    }
    fresh = [r for r in rows if r["id"] not in used]
    exact = [r for r in fresh if r["difficulty"] == difficulty]
    pool = exact or fresh
    return random.choice(pool) if pool else None


def _previous_questions(ctx: RequestContext, topic: str, limit: int = 25) -> list[str]:
    """The candidate's most recent questions on this topic from earlier sessions (to avoid repeats)."""
    rows = (
        ctx.db.table("interview_questions")
        .select("question_text, topic")
        .eq("user_id", ctx.user_id)
        .order("asked_at", desc=True)
        .limit(200)
        .execute()
        .data
        or []
    )
    return [r["question_text"] for r in rows if r["topic"].lower() == topic.lower()][:limit]


def _pick_angle(kind: str, used: list[str]) -> str:
    options = CODING_PATTERNS if kind == "coding" else prompts.QUESTION_ANGLES
    fresh = [a for a in options if a not in used] or options
    angle = random.choice(fresh)
    return f"use the problem pattern: {angle}" if kind == "coding" else angle


def _resume_focus(ctx: RequestContext, avoid: set[str], used_focus: list[str]) -> str | None:
    """A specific resume item to ask about, taken from the candidate's latest resume analysis."""
    analysis = cctx.latest_resume_analysis(ctx.db, ctx.user_id)
    seeds = ((analysis or {}).get("result") or {}).get("interview_questions") or []
    fresh = [q for q in seeds if q.get("question") not in avoid and q.get("based_on") not in used_focus]
    if not fresh:
        return None
    seed = random.choice(fresh)
    return f"{seed.get('based_on')} (for example: {seed.get('question')})"


def next_question(ctx: RequestContext, session_id: str) -> dict:
    s = get_session(ctx, session_id)
    if s["status"] in ("completed", "abandoned"):
        raise ConflictError("This interview has already ended.", code="session_ended")

    qs = _questions(ctx, session_id)
    if qs:
        last = qs[-1]
        if not last["interview_responses"]:
            return {"done": False, "question": public_question(last)}
        if not last["answer_evaluations"]:
            raise ConflictError("Your last answer has not been evaluated yet. Please resubmit it.", code="evaluation_pending")

    plan = s["plan"]
    pending = plan.get("pending_follow_up")
    target = s["target_question_count"]
    if (plan.get("main_questions_asked", 0) >= target and not pending) or _time_up(s):
        return {"done": True, "question": None}

    profile_skills = cctx.load_skills(ctx.db, ctx.user_id)
    asked_texts = [q["question_text"] for q in qs]
    difficulty = s["current_difficulty"]
    seq = len(qs) + 1
    ai = get_ai()

    parent = next((q for q in qs if q["id"] == pending and q["answer_evaluations"]), None) if pending else None
    if parent is not None:
        ev = parent["answer_evaluations"][0]
        gen, model = ai.structured(
            prompts.follow_up_question(
                original_question=parent["question_text"],
                answer=parent["interview_responses"][0]["answer_text"],
                missing_concepts=ev.get("missing_concepts") or [],
                reason=ev.get("follow_up_reason"),
                kind=parent["kind"],
                topic=parent["topic"],
                difficulty=parent["difficulty"],
            ),
            GeneratedQuestion,
            user_id=ctx.user_id,
            feature="interview_question",
        )
        row = {
            "parent_question_id": parent["id"],
            "topic": parent["topic"],
            "kind": parent["kind"],
            "difficulty": parent["difficulty"],
            "question_text": gen.question,
            "expected_points": gen.expected_points,
            "details": gen.details.model_dump(),
            "source": "ai_generated",
            "selection_reason": "Follow-up: " + (ev.get("follow_up_reason") or "clarify a partially correct answer."),
        }
        plan["pending_follow_up"] = None
        plan["follow_ups_used"] = plan.get("follow_ups_used", 0) + 1
    else:
        plan["pending_follow_up"] = None
        topics = adaptive.plan_from_dict(plan["topics"])
        states = adaptive.states_from_dict(plan.get("state", {}))
        last_topic = qs[-1]["topic"] if qs else None
        chosen, reason = adaptive.select_next_topic(topics, states, last_topic)
        reason = f"{reason} Difficulty {difficulty}/5."

        # Mix verified bank questions with freshly generated ones. Resume and coding questions are
        # always generated (they need the resume / structured examples).
        bank = None
        if chosen.kind not in ("resume", "coding") and random.random() < BANK_SHARE:
            bank = _pick_bank_question(ctx, chosen.topic, chosen.kind, difficulty)
        if bank:
            row = {
                "topic": chosen.topic,
                "kind": chosen.kind,
                "difficulty": difficulty,
                "question_text": bank["question_text"],
                "expected_points": bank["expected_points"],
                "details": {},
                "source": "question_bank",
                "question_bank_id": bank["id"],
                "selection_reason": reason + " Selected from the verified question bank.",
            }
        else:
            company_context, _ = verified_company_context(ctx.db, s.get("company_id"), s.get("job_listing_id"))
            # With a resume attached, ground resume, technical, behavioral and design questions in it.
            resume_summary = (
                cctx.resume_summary_for_ai(ctx.db, ctx.user_id, s.get("resume_id"))
                if s.get("resume_id") and chosen.kind in ("resume", "technical", "behavioral", "system_design")
                else None
            )
            previous = _previous_questions(ctx, chosen.topic)
            angle = _pick_angle(chosen.kind, plan.get("angles_used", []))
            plan["angles_used"] = [*plan.get("angles_used", []), angle][-12:]
            resume_focus = None
            if chosen.kind == "resume":
                resume_focus = _resume_focus(ctx, set(previous) | set(asked_texts), plan.get("resume_focus_used", []))
                if resume_focus:
                    plan["resume_focus_used"] = [*plan.get("resume_focus_used", []), resume_focus.split(" (for example")[0]]
            gen, model = ai.structured(
                prompts.generate_question(
                    role_title=s["role_title"],
                    experience_level=s["experience_level"],
                    kind=chosen.kind,
                    topic=chosen.topic,
                    difficulty=difficulty,
                    resume_summary=resume_summary,
                    candidate_skills=profile_skills,
                    company_context=company_context,
                    asked_questions=asked_texts,
                    weak_topics=plan.get("weak_topics_used", []),
                    angle=angle,
                    previous_questions=previous,
                    resume_focus=resume_focus,
                ),
                GeneratedQuestion,
                user_id=ctx.user_id,
                feature="interview_question",
                temperature=0.9,
            )
            reason += f" Angle: {angle}." + (" Based on your resume." if chosen.kind == "resume" else "")
            row = {
                "topic": chosen.topic,
                "kind": chosen.kind,
                "difficulty": difficulty,
                "question_text": gen.question,
                "expected_points": gen.expected_points,
                "details": gen.details.model_dump() if chosen.kind == "coding" else {},
                "source": "ai_generated",
                "selection_reason": reason,
            }
        st = states.setdefault(chosen.topic, adaptive.TopicState())
        st.asked += 1
        plan["state"] = adaptive.states_to_dict(states)
        plan["main_questions_asked"] = plan.get("main_questions_asked", 0) + 1

    row.update({"session_id": session_id, "user_id": ctx.user_id, "sequence_no": seq})
    inserted = ctx.admin.table("interview_questions").insert(row).execute().data[0]

    update = {"plan": plan, "status": "in_progress"}
    if not s.get("started_at"):
        update["started_at"] = _now()
    ctx.admin.table("interview_sessions").update(update).eq("id", session_id).eq("user_id", ctx.user_id).execute()
    return {"done": False, "question": public_question(inserted)}


# ---------------------------------------------------------------------------
# Submit answer
# ---------------------------------------------------------------------------
def submit_answer(ctx: RequestContext, session_id: str, question_id: str, payload: dict) -> dict:
    s = get_session(ctx, session_id)
    if s["status"] != "in_progress":
        raise ConflictError("This interview is not in progress.", code="session_not_active")

    qrows = _normalise(
        ctx.admin.table("interview_questions")
        .select("*, interview_responses(*), answer_evaluations(id)")
        .eq("id", question_id)
        .eq("session_id", session_id)
        .eq("user_id", ctx.user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not qrows:
        raise NotFoundError("Question not found in this interview.")
    q = qrows[0]
    if q["answer_evaluations"]:
        raise ConflictError("This question has already been answered.", code="already_answered")

    answer = (payload.get("answer_text") or "").strip() or "(The candidate did not provide an answer.)"
    if q["interview_responses"]:
        response = q["interview_responses"][0]  # retry after a failed evaluation
    else:
        response = (
            ctx.admin.table("interview_responses")
            .insert(
                {
                    "question_id": question_id,
                    "session_id": session_id,
                    "user_id": ctx.user_id,
                    "answer_text": answer,
                    "code_language": payload.get("code_language"),
                    "answer_mode": payload.get("answer_mode", "text"),
                    "duration_seconds": payload.get("duration_seconds"),
                }
            )
            .execute()
            .data[0]
        )

    ev, model = get_ai().structured(
        prompts.evaluate_answer(
            question=q["question_text"],
            kind=q["kind"],
            topic=q["topic"],
            difficulty=q["difficulty"],
            expected_points=q.get("expected_points") or [],
            answer=response["answer_text"],
            answer_mode=response["answer_mode"],
            code_language=response.get("code_language"),
        ),
        AnswerEvaluationAI,
        user_id=ctx.user_id,
        feature="answer_evaluation",
        temperature=0.1,
    )

    scored = rubric.score_question(
        q["kind"],
        ev.dimension_scores.model_dump(),
        {t.criterion: t.score for t in ev.technical_scores} if ev.technical_scores else None,
    )

    plan = s["plan"]
    states = adaptive.states_from_dict(plan.get("state", {}))
    states.setdefault(q["topic"], adaptive.TopicState()).scores.append(scored.question_score)
    plan["state"] = adaptive.states_to_dict(states)
    plan["scores"] = [*plan.get("scores", []), scored.question_score]

    before = s["current_difficulty"]
    after, adjust_reason = adaptive.adjust_difficulty(before, plan["scores"])

    follow, follow_reason = adaptive.decide_follow_up(
        evaluator_requests=ev.needs_follow_up,
        question_score=scored.question_score,
        is_follow_up=q.get("parent_question_id") is not None,
        follow_ups_used=plan.get("follow_ups_used", 0),
        target_questions=s["target_question_count"],
    )
    plan["pending_follow_up"] = question_id if follow else None

    evaluation = (
        ctx.admin.table("answer_evaluations")
        .insert(
            {
                "response_id": response["id"],
                "question_id": question_id,
                "session_id": session_id,
                "user_id": ctx.user_id,
                "rubric_version": rubric.RUBRIC_VERSION,
                "dimension_scores": scored.dimension_scores,
                "technical_track": scored.technical_track,
                "technical_scores": scored.technical_scores,
                "question_score": scored.question_score,
                "communication_score": scored.communication_score,
                "feedback": ev.feedback,
                "strengths": ev.strengths,
                "missing_concepts": ev.missing_concepts,
                "incorrect_statements": ev.incorrect_statements,
                "model_answer_outline": ev.model_answer_outline,
                "dimension_rationale": ev.dimension_rationale,
                "needs_follow_up": follow,
                "follow_up_reason": (ev.follow_up_reason if follow else follow_reason),
                "difficulty_before": before,
                "difficulty_after": after,
                "adjustment_reason": adjust_reason,
                "model": model,
            }
        )
        .execute()
        .data[0]
    )
    ctx.admin.table("interview_sessions").update({"plan": plan, "current_difficulty": after}).eq("id", session_id).eq(
        "user_id", ctx.user_id
    ).execute()

    return {
        "evaluation": evaluation,
        "follow_up_next": follow,
        "progress": {"main_questions_asked": plan.get("main_questions_asked", 0), "target": s["target_question_count"]},
    }


# ---------------------------------------------------------------------------
# End + report
# ---------------------------------------------------------------------------
def _existing_report(ctx: RequestContext, session_id: str) -> dict | None:
    rows = ctx.admin.table("interview_reports").select("*").eq("session_id", session_id).eq("user_id", ctx.user_id).limit(1).execute().data
    return rows[0] if rows else None


def end_session(ctx: RequestContext, session_id: str) -> dict:
    s = get_session(ctx, session_id)
    existing = _existing_report(ctx, session_id)
    if existing:
        return {"status": "completed", "report": existing}

    qs = _questions(ctx, session_id)
    evals = (
        ctx.admin.table("answer_evaluations")
        .select("question_id, question_score, communication_score, dimension_scores, technical_track, technical_scores, feedback")
        .eq("session_id", session_id)
        .eq("user_id", ctx.user_id)
        .execute()
        .data
        or []
    )
    if not evals:
        ctx.admin.table("interview_sessions").update({"status": "abandoned", "ended_at": _now()}).eq("id", session_id).eq(
            "user_id", ctx.user_id
        ).execute()
        _complete_assessment(ctx, s)
        return {"status": "abandoned", "report": None}

    by_q = {q["id"]: q for q in qs}
    enriched = [{**e, "topic": by_q[e["question_id"]]["topic"]} for e in evals if e["question_id"] in by_q]
    agg = rubric.aggregate(enriched)

    transcript = []
    eval_by_q = {e["question_id"]: e for e in evals}
    for q in qs:
        e = eval_by_q.get(q["id"])
        if not e:
            continue
        transcript.append(
            {
                "question": q["question_text"],
                "topic": q["topic"],
                "kind": q["kind"],
                "difficulty": q["difficulty"],
                "answer": (q["interview_responses"][0]["answer_text"] if q["interview_responses"] else "")[:1500],
                "score": e["question_score"],
                "evaluator_feedback": e["feedback"],
            }
        )

    if not s.get("ended_at"):
        ctx.admin.table("interview_sessions").update({"ended_at": _now()}).eq("id", session_id).eq("user_id", ctx.user_id).execute()

    summary, model = get_ai().structured(
        prompts.interview_report(
            role_title=s["role_title"],
            interview_type=s["interview_type"],
            transcript=transcript,
            computed_scores={k: agg[k] for k in ("overall_score", "dimension_averages", "technical_averages", "topic_scores")},
        ),
        InterviewReportAI,
        user_id=ctx.user_id,
        feature="interview_report",
        temperature=0.3,
        max_tokens=2500,
    )

    report = (
        ctx.admin.table("interview_reports")
        .insert(
            {
                "session_id": session_id,
                "user_id": ctx.user_id,
                "rubric_version": s["rubric_version"],
                "interview_type": s["interview_type"],
                "overall_score": agg["overall_score"],
                "dimension_averages": agg["dimension_averages"],
                "technical_averages": agg["technical_averages"] or None,
                "topic_scores": agg["topic_scores"],
                "summary": summary.model_dump(),
                "suggested_next_difficulty": adaptive.suggested_next_difficulty(
                    s["start_difficulty"], s["current_difficulty"], agg["overall_score"]
                ),
                "model": model,
            }
        )
        .execute()
        .data[0]
    )
    ctx.admin.table("interview_sessions").update({"status": "completed"}).eq("id", session_id).eq("user_id", ctx.user_id).execute()
    _complete_assessment(ctx, s)
    return {"status": "completed", "report": report}


def _complete_assessment(ctx: RequestContext, session: dict) -> None:
    """A company assessment interview has ended: mark the candidate's invitation completed."""
    inv_id = session.get("assessment_invitation_id")
    if inv_id:
        ctx.admin.table("assessment_invitations").update({"status": "completed", "completed_at": _now()}).eq("id", inv_id).eq(
            "candidate_user_id", ctx.user_id
        ).neq("status", "completed").execute()


def session_detail(ctx: RequestContext, session_id: str) -> dict:
    s = get_session(ctx, session_id)
    qs = _normalise(
        ctx.db.table("interview_questions")
        .select("*, interview_responses(*), answer_evaluations(*)")
        .eq("session_id", session_id)
        .order("sequence_no")
        .execute()
        .data
        or []
    )
    finished = s["status"] in ("completed", "abandoned")
    items = []
    for q in qs:
        item = public_question(q)
        item["response"] = q["interview_responses"][0] if q["interview_responses"] else None
        item["evaluation"] = q["answer_evaluations"][0] if q["answer_evaluations"] else None
        if finished:
            item["expected_points"] = q.get("expected_points") or []
        items.append(item)
    company = None
    if s.get("company_id"):
        rows = ctx.db.table("companies").select("id, name, slug").eq("id", s["company_id"]).limit(1).execute().data
        company = rows[0] if rows else None
    session_public = {k: v for k, v in s.items() if k != "plan"}
    session_public["plan_topics"] = s["plan"].get("topics", [])
    hidden = bool(s.get("results_hidden"))
    assessment = None
    if s.get("assessment_invitation_id"):
        inv = (
            ctx.admin.table("assessment_invitations")
            .select("assessment_id, org_id")
            .eq("id", s["assessment_invitation_id"])
            .limit(1)
            .execute()
            .data
        )
        if inv:
            a = ctx.admin.table("assessments").select("title, proctoring_enabled").eq("id", inv[0]["assessment_id"]).limit(
                1
            ).execute().data or [{}]
            org = ctx.admin.table("organizations").select("name").eq("id", inv[0]["org_id"]).limit(1).execute().data or [{}]
            assessment = {
                "invitation_id": s["assessment_invitation_id"],
                "title": a[0].get("title"),
                "company": org[0].get("name"),
                "proctoring_enabled": a[0].get("proctoring_enabled", False),
            }
    if hidden:
        for item in items:
            item["evaluation"] = None
            item.pop("expected_points", None)
    return {
        "session": session_public,
        "company": company,
        "questions": items,
        "report": None if hidden else _existing_report(ctx, session_id),
        "assessment": assessment,
        "results_hidden": hidden,
    }
