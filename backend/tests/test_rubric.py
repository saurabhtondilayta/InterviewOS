import pytest

from app.services.interview import rubric
from app.services.resume_service import RESUME_SECTION_WEIGHTS, compute_resume_score


@pytest.mark.parametrize("weights", [*rubric.GENERAL_WEIGHTS.values(), *rubric.TECHNICAL_TRACKS.values()])
def test_weights_sum_to_one(weights):
    assert sum(weights.values()) == pytest.approx(1.0)


def test_resume_weights_sum_to_one():
    assert sum(RESUME_SECTION_WEIGHTS.values()) == pytest.approx(1.0)


def test_technical_question_weighting():
    dims = {"relevance": 10, "correctness": 10, "depth": 0, "communication": 0, "problem_solving": 0}
    s = rubric.score_question("technical", dims)
    assert s.question_score == pytest.approx(5.0)  # 0.15*10 + 0.35*10
    assert s.technical_track is None


def test_coding_score_excludes_communication():
    tech = {"correctness": 8, "efficiency": 6, "code_quality": 7, "edge_cases": 5}
    poor_comm = rubric.score_question("coding", {"communication": 0, "correctness": 8}, tech)
    great_comm = rubric.score_question("coding", {"communication": 10, "correctness": 8}, tech)
    assert poor_comm.question_score == great_comm.question_score == pytest.approx(0.4 * 8 + 0.25 * 6 + 0.15 * 7 + 0.2 * 5, abs=0.05)
    assert poor_comm.communication_score == 0
    assert great_comm.communication_score == 10
    assert poor_comm.technical_track == "coding"


def test_system_design_track_and_key_normalisation():
    tech = {"Requirements": 6, "architecture": 8, "Scalability": 7, "trade-offs": 5}
    s = rubric.score_question("system_design", {"communication": 9}, tech)
    assert s.technical_scores == {"requirements": 6, "architecture": 8, "scalability": 7, "trade_offs": 5}


def test_missing_technical_criteria_fall_back_to_general_dimensions():
    dims = {"relevance": 5, "correctness": 7, "depth": 4, "communication": 9, "problem_solving": 6}
    s = rubric.score_question("coding", dims, None)
    assert s.technical_scores == {"correctness": 7, "efficiency": 6, "code_quality": 4, "edge_cases": 6}


def test_scores_are_clamped():
    s = rubric.score_question("hr", {d: 15 for d in rubric.DIMENSIONS})
    assert s.question_score == 10


def test_aggregate():
    evals = [
        {
            "question_score": 8,
            "topic": "OS",
            "dimension_scores": dict.fromkeys(rubric.DIMENSIONS, 8),
            "technical_track": None,
            "technical_scores": None,
        },
        {
            "question_score": 4,
            "topic": "OS",
            "dimension_scores": dict.fromkeys(rubric.DIMENSIONS, 4),
            "technical_track": None,
            "technical_scores": None,
        },
        {
            "question_score": 6,
            "topic": "DSA",
            "dimension_scores": dict.fromkeys(rubric.DIMENSIONS, 6),
            "technical_track": "coding",
            "technical_scores": {"correctness": 6, "efficiency": 6, "code_quality": 6, "edge_cases": 6},
        },
    ]
    agg = rubric.aggregate(evals)
    assert agg["overall_score"] == 6.0
    assert agg["topic_scores"]["OS"] == {"average": 6.0, "questions": 2}
    assert agg["technical_averages"]["coding"]["correctness"] == 6.0
    assert agg["dimension_averages"]["depth"] == 6.0


def test_aggregate_empty():
    assert rubric.aggregate([])["overall_score"] is None


def test_resume_score_computation():
    sections = [{"section": s, "score": 10} for s in RESUME_SECTION_WEIGHTS]
    score, breakdown = compute_resume_score(sections)
    assert score == 100.0
    assert breakdown["skills"]["contribution"] == 15.0

    score, breakdown = compute_resume_score([{"section": "skills", "score": 8}])
    assert score == pytest.approx(12.0)  # 8 * 0.15 * 10; absent sections count as 0
    assert breakdown["projects"]["score"] == 0
