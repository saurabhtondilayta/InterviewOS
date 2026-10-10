import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import auth
from app.main import create_app
from app.schemas import InvitationAccept, InviteRequest, ProctorBatch
from app.services.proctoring import RULES, summarize


def _ev(kind: str, n: int = 1) -> list[dict]:
    return [{"kind": kind}] * n


def test_clean_session_scores_100():
    score, s = summarize(_ev("session_start") + _ev("session_end"))
    assert score == 100.0
    assert s["total_flags"] == 0
    assert s["verdict"] == "No major concerns"


def test_penalties_are_summed_and_capped_per_kind():
    per, cap, _ = RULES["tab_hidden"]
    score, s = summarize(_ev("tab_hidden", cap + 10))
    assert score == 100 - per * cap
    assert s["flags"][0]["count"] == cap + 10


def test_serious_flags_lead_to_significant_concerns_and_sorted_breakdown():
    score, s = summarize(_ev("multiple_faces", 3) + _ev("phone_detected", 2) + _ev("looking_away"))
    assert score == pytest.approx(100 - 45 - 30 - 4)
    assert s["verdict"].startswith("Significant concerns")
    penalties = [f["penalty"] for f in s["flags"]]
    assert penalties == sorted(penalties, reverse=True)
    assert "not proof" in s["note"]


def test_score_never_negative():
    events = [e for k in RULES for e in _ev(k, 10)]
    assert summarize(events)[0] == 0.0


def test_invite_emails_are_normalised_and_deduplicated():
    r = InviteRequest(emails=[" A@Example.com", "a@example.com", "b@x.io", ""])
    assert r.emails == ["a@example.com", "b@x.io"]
    with pytest.raises(ValidationError):
        InviteRequest(emails=["not-an-email"])


def test_accepting_requires_explicit_consent():
    with pytest.raises(ValidationError):
        InvitationAccept(consent=False)
    assert InvitationAccept(consent=True).consent is True


def test_proctor_batch_rejects_unknown_kinds_and_oversized_batches():
    ok = {"kind": "tab_hidden", "severity": 2, "occurred_at": "2026-10-10T10:00:00Z"}
    ProctorBatch(events=[ok])
    with pytest.raises(ValidationError):
        ProctorBatch(events=[{**ok, "kind": "mind_reading"}])
    with pytest.raises(ValidationError):
        ProctorBatch(events=[ok] * 51)


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/org"),
        ("get", "/api/org/assessments"),
        ("get", "/api/invitations"),
        ("post", "/api/invitations/claim"),
        ("post", "/api/proctoring/00000000-0000-0000-0000-000000000000/events"),
    ],
)
def test_hiring_routes_require_token(method, path):
    auth._cache.clear()
    r = getattr(TestClient(create_app()), method)(path)
    assert r.status_code == 401
