import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app import auth
from app.ai import prompts
from app.ai.client import AIClient
from app.errors import AIServiceError
from app.main import create_app
from app.services.interview import adaptive, engine

AI = "https://api.test-ai.local/v1"


# --- question variety ---------------------------------------------------------
def test_resume_topic_gets_fixed_share():
    plan = adaptive.build_plan(
        "technical", [{"topic": "OS", "weight": 0.5, "kind": "technical"}, {"topic": "DBMS", "weight": 0.5, "kind": "technical"}]
    )
    plan = adaptive.add_resume_topic(plan, "Resume Deep-Dive", 0.3)
    weights = {t.topic: t.weight for t in plan}
    assert weights["Resume Deep-Dive"] == pytest.approx(0.3)
    assert sum(weights.values()) == pytest.approx(1.0)
    assert next(t for t in plan if t.topic == "Resume Deep-Dive").kind == "resume"


def test_resume_topic_not_duplicated():
    plan = adaptive.build_plan("full", [{"topic": "Projects", "weight": 1, "kind": "resume"}])
    assert adaptive.add_resume_topic(plan, "Resume Deep-Dive", 0.3) == plan


def test_angles_rotate_without_repeating_until_exhausted():
    used: list[str] = []
    for _ in range(len(prompts.QUESTION_ANGLES)):
        used.append(engine._pick_angle("technical", used))
    assert len(set(used)) == len(prompts.QUESTION_ANGLES)


def test_coding_uses_problem_patterns():
    angle = engine._pick_angle("coding", [])
    assert angle.startswith("use the problem pattern:")


def test_prompt_includes_history_angle_and_resume_focus():
    msgs = prompts.generate_question(
        role_title="SDE",
        experience_level="fresher",
        kind="resume",
        topic="Resume Deep-Dive",
        difficulty=3,
        resume_summary="Built an expense tracker with Flask",
        candidate_skills=["Python"],
        company_context=None,
        asked_questions=["Q in this session"],
        weak_topics=[],
        angle="a design decision and its trade-offs",
        previous_questions=["Old question from last week"],
        resume_focus="Expense tracker project",
    )
    system, user = msgs[0]["content"], msgs[1]["content"]
    assert "a design decision and its trade-offs" in system
    assert "Quote the item by name" in system
    assert "Old question from last week" in user
    assert "Expense tracker project" in user


# --- voice: AI client -------------------------------------------------------
@respx.mock
def test_transcribe_sends_audio_and_returns_text(no_usage):
    route = respx.post(f"{AI}/audio/transcriptions").mock(return_value=httpx.Response(200, json={"text": " I used Flask. "}))
    text = AIClient(httpx.Client(base_url=AI)).transcribe(
        b"x" * 2000, filename="a.webm", content_type="audio/webm", prompt="Terms: Flask", user_id="u"
    )
    assert text == "I used Flask."
    body = route.calls[0].request.content
    assert b"whisper-large-v3-turbo" in body and b"Terms: Flask" in body


@respx.mock
def test_speak_returns_audio_bytes(no_usage):
    respx.post(f"{AI}/audio/speech").mock(return_value=httpx.Response(200, content=b"RIFFwav", headers={"content-type": "audio/wav"}))
    assert AIClient(httpx.Client(base_url=AI)).speak("Hello", user_id="u") == b"RIFFwav"


@respx.mock
def test_speak_reports_model_terms_not_accepted(no_usage):
    respx.post(f"{AI}/audio/speech").mock(
        return_value=httpx.Response(
            400, json={"error": {"message": "The model requires terms acceptance. Please have the org admin accept"}}
        )
    )
    with pytest.raises(AIServiceError) as e:
        AIClient(httpx.Client(base_url=AI)).speak("Hello", user_id="u")
    assert e.value.code == "ai_model_unavailable"


# --- voice: HTTP endpoints ------------------------------------------------------
@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(auth, "verify_token", lambda t: auth.CurrentUser("11111111-1111-1111-1111-111111111111", "e", t, True))
    return TestClient(create_app())


def test_transcribe_rejects_unsupported_and_empty_audio(api):
    h = {"Authorization": "Bearer t"}
    r = api.post("/api/voice/transcribe", headers=h, files={"audio": ("a.txt", b"x" * 5000, "text/plain")})
    assert r.status_code == 422 and r.json()["error"]["code"] == "unsupported_audio"
    r = api.post("/api/voice/transcribe", headers=h, files={"audio": ("a.webm", b"x" * 10, "audio/webm")})
    assert r.status_code == 422 and r.json()["error"]["code"] == "audio_empty"


def test_speak_validates_length(api):
    r = api.post("/api/voice/speak", headers={"Authorization": "Bearer t"}, json={"text": "x" * 2000})
    assert r.status_code == 422


def test_voice_requires_login():
    c = TestClient(create_app())
    assert c.post("/api/voice/speak", json={"text": "hi"}).status_code == 401


# --- usage: voice has its own allowance ---------------------------------------
def test_voice_and_text_limits_are_counted_separately(monkeypatch):
    from app import usage

    calls: list[dict] = []

    def fake_count(user_id, since, feature=None, *, voice=False):
        calls.append({"feature": feature, "voice": voice})
        return 0

    monkeypatch.setattr(usage, "_count_since", fake_count)
    usage.check_rate_limit("u", "voice_transcribe")
    assert calls == [{"feature": None, "voice": True}]
    calls.clear()
    usage.check_rate_limit("u", "interview_question")
    assert all(c["voice"] is False for c in calls)


def test_reasoning_effort_only_on_chat(no_usage, monkeypatch):
    monkeypatch.setenv("AI_REASONING_EFFORT", "low")
    from app.config import get_settings

    get_settings.cache_clear()
    with respx.mock:
        route = respx.post(f"{AI}/audio/speech").mock(return_value=httpx.Response(200, content=b"wav"))
        AIClient(httpx.Client(base_url=AI)).speak("hi", user_id=None)
        assert "reasoning_effort" not in json.loads(route.calls[0].request.content)
