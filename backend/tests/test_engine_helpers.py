from app.services.interview.engine import _normalise


def test_one_to_one_embeds_are_normalised_to_lists():
    # PostgREST returns interview_responses (unique question_id) as an object or null.
    rows = _normalise(
        [
            {"id": "q1", "interview_responses": {"id": "r1", "answer_text": "a"}, "answer_evaluations": [{"id": "e1"}]},
            {"id": "q2", "interview_responses": None, "answer_evaluations": []},
            {"id": "q3", "interview_responses": [{"id": "r3"}]},
        ]
    )
    assert rows[0]["interview_responses"] == [{"id": "r1", "answer_text": "a"}]
    assert rows[0]["answer_evaluations"] == [{"id": "e1"}]
    assert rows[1]["interview_responses"] == []
    assert rows[2]["interview_responses"] == [{"id": "r3"}]
    assert "answer_evaluations" not in rows[2]
