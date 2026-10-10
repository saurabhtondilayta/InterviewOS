"""Explainable adaptive interview algorithm (pure functions, no I/O).

1. build_plan()            - turn the role's competency framework + interview type + selected
                             topics + previous weak topics into weighted plan topics.
2. select_next_topic()     - pick the topic with the highest priority:
                             priority = weight x weakness_boost x (1 - 0.6 x mastery/10) / (1 + times_asked)
                             Unasked topics therefore come first (coverage), then topics where
                             the candidate scores lowest (remediation).
3. adjust_difficulty()     - move difficulty up/down by one step based on a smoothed score of
                             the last two answers (thresholds 7.5 and 4.5).
4. decide_follow_up()      - ask at most one clarifying follow-up per question, only for
                             partially correct answers, within a per-session budget.
Every decision returns a human-readable reason that is stored with the question/evaluation.
"""

from dataclasses import dataclass, field

UP_THRESHOLD = 7.5
DOWN_THRESHOLD = 4.5
MIN_DIFFICULTY, MAX_DIFFICULTY = 1, 5

MINUTES_PER_QUESTION = {"coding": 12, "system_design": 15}
DEFAULT_MINUTES_PER_QUESTION = 4

# Topic sets used when the interview type is not covered by the role's competency framework.
DEFAULT_TOPICS: dict[str, list[tuple[str, str]]] = {
    "hr": [
        ("Career Goals & Motivation", "hr"),
        ("Strengths & Areas to Improve", "hr"),
        ("Role & Organisation Fit", "hr"),
        ("Self-Introduction", "hr"),
    ],
    "behavioral": [
        ("Teamwork & Collaboration", "behavioral"),
        ("Conflict Resolution", "behavioral"),
        ("Ownership & Leadership", "behavioral"),
        ("Handling Failure & Feedback", "behavioral"),
        ("Time Management & Prioritisation", "behavioral"),
    ],
    "resume": [
        ("Projects", "resume"),
        ("Internships & Work Experience", "resume"),
        ("Technical Skills Claimed on Resume", "resume"),
    ],
    "coding": [("Data Structures & Algorithms", "coding")],
    "system_design": [("System Design Basics", "system_design")],
    "technical": [
        ("Object-Oriented Programming", "technical"),
        ("Database Management Systems", "technical"),
        ("Operating Systems", "technical"),
        ("Computer Networks", "technical"),
    ],
}

# Which competency kinds each interview type draws from.
TYPE_KINDS: dict[str, set[str]] = {
    "hr": {"hr"},
    "behavioral": {"behavioral"},
    "resume": {"resume"},
    "coding": {"coding"},
    "system_design": {"system_design"},
    "technical": {"technical"},
    "company": {"technical", "coding", "system_design", "resume", "behavioral", "hr"},
    "full": {"technical", "coding", "system_design", "resume", "behavioral", "hr"},
}

# Question kind used for a user-selected topic that is not in the role's framework.
_KIND_DEFAULT_FOR_TYPE = {
    "hr": "hr",
    "behavioral": "behavioral",
    "resume": "resume",
    "coding": "coding",
    "system_design": "system_design",
    "technical": "technical",
    "company": "technical",
    "full": "technical",
}


@dataclass
class PlanTopic:
    topic: str
    kind: str
    weight: float
    weak_before: bool = False

    def to_dict(self) -> dict:
        return {"topic": self.topic, "kind": self.kind, "weight": round(self.weight, 4), "weak_before": self.weak_before}


@dataclass
class TopicState:
    asked: int = 0
    scores: list[float] = field(default_factory=list)

    @property
    def mastery(self) -> float | None:
        return sum(self.scores) / len(self.scores) if self.scores else None


def build_plan(
    interview_type: str,
    competencies: list[dict],
    selected_topics: list[str] | None = None,
    weak_topics: list[str] | None = None,
) -> list[PlanTopic]:
    kinds = TYPE_KINDS.get(interview_type, {"technical"})
    weak = {t.strip().lower() for t in (weak_topics or [])}

    by_name = {c["topic"].strip().lower(): c for c in competencies}
    topics: list[PlanTopic] = []

    if selected_topics:
        for name in selected_topics:
            name = name.strip()
            if not name:
                continue
            comp = by_name.get(name.lower())
            kind = comp["kind"] if comp else _KIND_DEFAULT_FOR_TYPE.get(interview_type, "technical")
            if interview_type in ("coding", "system_design"):
                kind = interview_type
            weight = float(comp["weight"]) if comp else 1.0 / len(selected_topics)
            topics.append(PlanTopic(name, kind, weight))
    else:
        topics = [PlanTopic(c["topic"], c["kind"], float(c["weight"])) for c in competencies if c.get("kind") in kinds]
        if not topics:
            defaults = DEFAULT_TOPICS.get(interview_type, DEFAULT_TOPICS["technical"])
            topics = [PlanTopic(t, k, 1.0 / len(defaults)) for t, k in defaults]

    # De-duplicate (case-insensitive), keep first occurrence.
    seen: set[str] = set()
    unique: list[PlanTopic] = []
    for t in topics:
        key = t.topic.lower()
        if key not in seen:
            seen.add(key)
            unique.append(t)

    for t in unique:
        t.weak_before = t.topic.lower() in weak

    total = sum(t.weight for t in unique) or 1.0
    for t in unique:
        t.weight = t.weight / total
    return unique


def add_resume_topic(plan: list[PlanTopic], topic: str, share: float) -> list[PlanTopic]:
    """Give resume-based questions a fixed share of the plan (unless the plan already has a resume topic)."""
    if not plan or any(t.kind == "resume" for t in plan) or not 0 < share < 1:
        return plan
    total = sum(t.weight for t in plan) or 1.0
    plan = [*plan, PlanTopic(topic, "resume", total * share / (1 - share))]
    new_total = sum(t.weight for t in plan)
    for t in plan:
        t.weight = t.weight / new_total
    return plan


def target_question_count(duration_minutes: int, interview_type: str) -> int:
    per_q = MINUTES_PER_QUESTION.get(interview_type, DEFAULT_MINUTES_PER_QUESTION)
    return max(2, min(15, round(duration_minutes / per_q)))


def topic_priority(t: PlanTopic, state: TopicState) -> float:
    mastery = state.mastery
    mastery_factor = 1.0 if mastery is None else (1 - 0.6 * mastery / 10)
    weakness_boost = 1.5 if t.weak_before else 1.0
    return t.weight * weakness_boost * mastery_factor / (1 + state.asked)


def select_next_topic(plan: list[PlanTopic], states: dict[str, TopicState], last_topic: str | None) -> tuple[PlanTopic, str]:
    if not plan:
        raise ValueError("Interview plan has no topics")

    candidates = [t for t in plan if t.topic != last_topic] or list(plan)
    scored = [(topic_priority(t, states.get(t.topic, TopicState())), i, t) for i, t in enumerate(candidates)]
    # Highest priority first; ties broken by plan order for determinism.
    scored.sort(key=lambda x: (-x[0], x[1]))
    priority, _, chosen = scored[0]

    st = states.get(chosen.topic, TopicState())
    if st.asked == 0:
        reason = f"'{chosen.topic}' has not been covered yet (role weight {chosen.weight:.0%})"
    else:
        reason = f"'{chosen.topic}' has the lowest mastery so far ({st.mastery:.1f}/10 over {st.asked} question(s))"
    if chosen.weak_before:
        reason += "; it was a weak topic in a previous interview"
    return chosen, reason + f". Priority score {priority:.3f}."


def adjust_difficulty(current: int, recent_scores: list[float]) -> tuple[int, str]:
    """recent_scores: question scores in chronological order (0-10)."""
    if not recent_scores:
        return current, "No answers yet; keeping the starting difficulty."
    last = recent_scores[-1]
    if len(recent_scores) >= 2:
        performance = 0.6 * last + 0.4 * recent_scores[-2]
        basis = f"smoothed score {performance:.1f} (60% latest {last:.1f}, 40% previous {recent_scores[-2]:.1f})"
    else:
        performance = last
        basis = f"score {performance:.1f}"

    if performance >= UP_THRESHOLD and current < MAX_DIFFICULTY:
        return current + 1, f"Raised difficulty to {current + 1}: {basis} >= {UP_THRESHOLD}."
    if performance <= DOWN_THRESHOLD and current > MIN_DIFFICULTY:
        return current - 1, f"Lowered difficulty to {current - 1}: {basis} <= {DOWN_THRESHOLD}."
    return current, f"Kept difficulty at {current}: {basis} is within the target band."


def decide_follow_up(
    *,
    evaluator_requests: bool,
    question_score: float,
    is_follow_up: bool,
    follow_ups_used: int,
    target_questions: int,
) -> tuple[bool, str]:
    budget = max(1, target_questions // 3)
    if is_follow_up:
        return False, "Already a follow-up question."
    if not evaluator_requests:
        return False, "The answer did not need clarification."
    if follow_ups_used >= budget:
        return False, f"Follow-up budget for this session ({budget}) is used up."
    if not (3.0 <= question_score < UP_THRESHOLD):
        return False, "Follow-ups are only asked for partially correct answers."
    return True, "Partially correct answer: asking one clarifying follow-up."


def suggested_next_difficulty(start: int, final: int, overall: float | None) -> int:
    if overall is None:
        return start
    if overall >= UP_THRESHOLD:
        return min(MAX_DIFFICULTY, final + 1)
    if overall <= DOWN_THRESHOLD:
        return max(MIN_DIFFICULTY, final - 1)
    return final


def plan_from_dict(raw: list[dict]) -> list[PlanTopic]:
    return [PlanTopic(r["topic"], r["kind"], float(r["weight"]), bool(r.get("weak_before"))) for r in raw]


def states_from_dict(raw: dict) -> dict[str, TopicState]:
    return {k: TopicState(asked=int(v.get("asked", 0)), scores=[float(s) for s in v.get("scores", [])]) for k, v in raw.items()}


def states_to_dict(states: dict[str, TopicState]) -> dict:
    return {k: {"asked": v.asked, "scores": v.scores} for k, v in states.items()}
