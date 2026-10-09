import pytest

from app.services.interview import adaptive
from app.services.interview.adaptive import PlanTopic, TopicState

SWE = [
    {"topic": "Data Structures & Algorithms", "weight": 0.25, "kind": "coding"},
    {"topic": "Object-Oriented Programming", "weight": 0.12, "kind": "technical"},
    {"topic": "Database Management Systems", "weight": 0.10, "kind": "technical"},
    {"topic": "Operating Systems", "weight": 0.08, "kind": "technical"},
    {"topic": "System Design Basics", "weight": 0.10, "kind": "system_design"},
    {"topic": "Projects & Experience", "weight": 0.13, "kind": "resume"},
    {"topic": "Behavioral & Teamwork", "weight": 0.10, "kind": "behavioral"},
    {"topic": "HR & Motivation", "weight": 0.05, "kind": "hr"},
]


class TestBuildPlan:
    def test_technical_interview_uses_only_technical_competencies(self):
        plan = adaptive.build_plan("technical", SWE)
        assert {t.kind for t in plan} == {"technical"}
        assert [t.topic for t in plan] == ["Object-Oriented Programming", "Database Management Systems", "Operating Systems"]

    def test_weights_are_normalised(self):
        plan = adaptive.build_plan("full", SWE)
        assert sum(t.weight for t in plan) == pytest.approx(1.0)
        assert len(plan) == len(SWE)

    def test_falls_back_to_default_topics_without_framework(self):
        plan = adaptive.build_plan("behavioral", [])
        assert len(plan) == len(adaptive.DEFAULT_TOPICS["behavioral"])
        assert all(t.kind == "behavioral" for t in plan)

    def test_selected_topics_override_framework(self):
        plan = adaptive.build_plan("technical", SWE, selected_topics=["Operating Systems", "Kubernetes"])
        assert [t.topic for t in plan] == ["Operating Systems", "Kubernetes"]
        assert plan[1].kind == "technical"

    def test_coding_interview_forces_coding_kind_for_selected_topics(self):
        plan = adaptive.build_plan("coding", SWE, selected_topics=["Graphs"])
        assert plan[0].kind == "coding"

    def test_weak_topics_are_flagged_case_insensitively(self):
        plan = adaptive.build_plan("technical", SWE, weak_topics=["operating systems"])
        flagged = [t.topic for t in plan if t.weak_before]
        assert flagged == ["Operating Systems"]

    def test_duplicate_selected_topics_are_removed(self):
        plan = adaptive.build_plan("technical", [], selected_topics=["DBMS", "dbms", "OS"])
        assert [t.topic for t in plan] == ["DBMS", "OS"]


class TestTopicSelection:
    def test_unasked_high_weight_topic_first(self):
        plan = [PlanTopic("A", "technical", 0.2), PlanTopic("B", "technical", 0.5), PlanTopic("C", "technical", 0.3)]
        chosen, reason = adaptive.select_next_topic(plan, {}, None)
        assert chosen.topic == "B"
        assert "not been covered" in reason

    def test_coverage_before_repetition(self):
        plan = [PlanTopic("A", "technical", 0.6), PlanTopic("B", "technical", 0.4)]
        states = {"A": TopicState(asked=1, scores=[2.0])}
        chosen, _ = adaptive.select_next_topic(plan, states, last_topic=None)
        assert chosen.topic == "B"

    def test_low_mastery_topic_revisited(self):
        plan = [PlanTopic("A", "technical", 0.5), PlanTopic("B", "technical", 0.5), PlanTopic("C", "technical", 0.0001)]
        states = {"A": TopicState(1, [2.0]), "B": TopicState(1, [9.0]), "C": TopicState(1, [5.0])}
        chosen, reason = adaptive.select_next_topic(plan, states, last_topic="C")
        assert chosen.topic == "A"
        assert "lowest mastery" in reason

    def test_does_not_repeat_last_topic_when_alternatives_exist(self):
        plan = [PlanTopic("A", "technical", 0.9), PlanTopic("B", "technical", 0.1)]
        chosen, _ = adaptive.select_next_topic(plan, {}, last_topic="A")
        assert chosen.topic == "B"

    def test_single_topic_plan_can_repeat(self):
        plan = [PlanTopic("A", "coding", 1.0)]
        chosen, _ = adaptive.select_next_topic(plan, {"A": TopicState(1, [5])}, last_topic="A")
        assert chosen.topic == "A"

    def test_weak_before_boost(self):
        plan = [PlanTopic("A", "technical", 0.5), PlanTopic("B", "technical", 0.4, weak_before=True)]
        chosen, reason = adaptive.select_next_topic(plan, {}, None)
        assert chosen.topic == "B"
        assert "weak topic" in reason

    def test_empty_plan_raises(self):
        with pytest.raises(ValueError):
            adaptive.select_next_topic([], {}, None)


class TestDifficulty:
    @pytest.mark.parametrize(
        ("current", "scores", "expected"),
        [
            (3, [9.0], 4),  # strong answer -> up
            (3, [3.0], 2),  # weak answer -> down
            (3, [6.0], 3),  # in band -> same
            (5, [10.0], 5),  # capped at 5
            (1, [0.0], 1),  # floored at 1
            (3, [4.0, 9.0], 3),  # smoothed: 0.6*9 + 0.4*4 = 7.0 -> stay
            (3, [8.0, 8.0], 4),  # smoothed 8.0 -> up
            (3, [6.0, 3.0], 2),  # smoothed 0.6*3 + 0.4*6 = 4.2 -> down
        ],
    )
    def test_adjustment(self, current, scores, expected):
        new, reason = adaptive.adjust_difficulty(current, scores)
        assert new == expected
        assert reason

    def test_no_scores_keeps_difficulty(self):
        assert adaptive.adjust_difficulty(2, [])[0] == 2


class TestFollowUp:
    def base(self, **kw):
        args = {"evaluator_requests": True, "question_score": 5.5, "is_follow_up": False, "follow_ups_used": 0, "target_questions": 6}
        return adaptive.decide_follow_up(**(args | kw))

    def test_partial_answer_gets_follow_up(self):
        assert self.base()[0] is True

    def test_no_follow_up_on_follow_up(self):
        assert self.base(is_follow_up=True)[0] is False

    def test_no_follow_up_when_not_requested(self):
        assert self.base(evaluator_requests=False)[0] is False

    def test_budget_enforced(self):
        assert self.base(follow_ups_used=2, target_questions=6)[0] is False

    @pytest.mark.parametrize("score", [1.0, 2.9, 7.5, 9.0])
    def test_only_partial_scores(self, score):
        assert self.base(question_score=score)[0] is False


def test_target_question_count():
    assert adaptive.target_question_count(30, "technical") == 8
    assert adaptive.target_question_count(30, "coding") == 2
    assert adaptive.target_question_count(120, "hr") == 15
    assert adaptive.target_question_count(5, "system_design") == 2


def test_state_roundtrip():
    states = {"A": TopicState(2, [4.0, 6.5])}
    assert adaptive.states_from_dict(adaptive.states_to_dict(states))["A"].mastery == pytest.approx(5.25)


def test_suggested_next_difficulty():
    assert adaptive.suggested_next_difficulty(3, 4, 8.0) == 5
    assert adaptive.suggested_next_difficulty(3, 2, 3.0) == 1
    assert adaptive.suggested_next_difficulty(3, 3, 6.0) == 3
    assert adaptive.suggested_next_difficulty(3, 3, None) == 3
