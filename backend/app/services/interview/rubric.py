"""Documented scoring model (rubric v1). See docs/SCORING.md.

General dimensions (0-10, rated by the AI evaluator against anchored descriptions):
    relevance, correctness, depth, communication, problem_solving

A question's score is a weighted average of those dimensions, with weights that depend on
the question type. Coding and system design questions are scored ONLY on their separate
technical track; communication is still recorded for them but reported separately and never
mixed into the technical score.

Scores are practice feedback. They are only comparable between sessions that share the same
rubric_version and interview type.
"""

from dataclasses import dataclass

RUBRIC_VERSION = "v1"

DIMENSIONS = ("relevance", "correctness", "depth", "communication", "problem_solving")

GENERAL_WEIGHTS: dict[str, dict[str, float]] = {
    "technical": {"relevance": 0.15, "correctness": 0.35, "depth": 0.25, "communication": 0.10, "problem_solving": 0.15},
    "resume": {"relevance": 0.20, "correctness": 0.20, "depth": 0.30, "communication": 0.15, "problem_solving": 0.15},
    "behavioral": {"relevance": 0.25, "correctness": 0.10, "depth": 0.25, "communication": 0.25, "problem_solving": 0.15},
    "hr": {"relevance": 0.30, "correctness": 0.10, "depth": 0.20, "communication": 0.30, "problem_solving": 0.10},
}

TECHNICAL_TRACKS: dict[str, dict[str, float]] = {
    "coding": {"correctness": 0.40, "efficiency": 0.25, "code_quality": 0.15, "edge_cases": 0.20},
    "system_design": {"requirements": 0.20, "architecture": 0.35, "scalability": 0.25, "trade_offs": 0.20},
}

# If the evaluator omits a technical criterion, fall back to the closest general dimension.
_TECH_FALLBACK = {
    "correctness": "correctness",
    "efficiency": "problem_solving",
    "code_quality": "depth",
    "edge_cases": "problem_solving",
    "requirements": "relevance",
    "architecture": "depth",
    "scalability": "problem_solving",
    "trade_offs": "depth",
}


@dataclass(frozen=True)
class QuestionScore:
    question_score: float
    communication_score: float
    technical_track: str | None
    technical_scores: dict[str, float] | None
    dimension_scores: dict[str, float]


def _clamp(v: float) -> float:
    return max(0.0, min(10.0, float(v)))


def _normalise_key(name: str) -> str:
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def score_question(kind: str, dimension_scores: dict[str, float], technical_scores: dict[str, float] | None = None) -> QuestionScore:
    dims = {d: _clamp(dimension_scores.get(d, 0)) for d in DIMENSIONS}
    communication = round(dims["communication"], 1)

    if kind in TECHNICAL_TRACKS:
        weights = TECHNICAL_TRACKS[kind]
        given = {_normalise_key(k): _clamp(v) for k, v in (technical_scores or {}).items()}
        track = {c: given.get(c, dims[_TECH_FALLBACK[c]]) for c in weights}
        total = sum(track[c] * w for c, w in weights.items())
        return QuestionScore(
            question_score=round(total, 1),
            communication_score=communication,
            technical_track=kind,
            technical_scores={k: round(v, 1) for k, v in track.items()},
            dimension_scores=dims,
        )

    weights = GENERAL_WEIGHTS.get(kind, GENERAL_WEIGHTS["technical"])
    total = sum(dims[d] * w for d, w in weights.items())
    return QuestionScore(
        question_score=round(total, 1),
        communication_score=communication,
        technical_track=None,
        technical_scores=None,
        dimension_scores=dims,
    )


def aggregate(evaluations: list[dict]) -> dict:
    """Aggregate per-question evaluations into session-level averages.

    Each evaluation dict needs: question_score, dimension_scores, technical_track,
    technical_scores, topic. Returns overall score, per-dimension averages (general dims),
    per-track technical averages, and per-topic averages.
    """
    if not evaluations:
        return {"overall_score": None, "dimension_averages": {}, "technical_averages": {}, "topic_scores": {}}

    overall = sum(e["question_score"] for e in evaluations) / len(evaluations)

    dim_avgs = {d: round(sum(_clamp(e["dimension_scores"].get(d, 0)) for e in evaluations) / len(evaluations), 1) for d in DIMENSIONS}

    tech: dict[str, dict[str, list[float]]] = {}
    for e in evaluations:
        if e.get("technical_track") and e.get("technical_scores"):
            bucket = tech.setdefault(e["technical_track"], {})
            for k, v in e["technical_scores"].items():
                bucket.setdefault(k, []).append(float(v))
    tech_avgs = {t: {k: round(sum(v) / len(v), 1) for k, v in crit.items()} for t, crit in tech.items()}

    topics: dict[str, list[float]] = {}
    for e in evaluations:
        topics.setdefault(e["topic"], []).append(float(e["question_score"]))
    topic_scores = {t: {"average": round(sum(v) / len(v), 1), "questions": len(v)} for t, v in topics.items()}

    return {
        "overall_score": round(overall, 1),
        "dimension_averages": dim_avgs,
        "technical_averages": tech_avgs,
        "topic_scores": topic_scores,
    }
