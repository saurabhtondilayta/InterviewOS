import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app import auth
from app.main import create_app

USER_URL = "https://test-project.supabase.co/auth/v1/user"


@pytest.fixture
def client():
    auth._cache.clear()
    return TestClient(create_app())


def test_health_is_public(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["supabase_configured"] is True


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/profile"),
        ("get", "/api/dashboard"),
        ("get", "/api/resumes"),
        ("post", "/api/interviews"),
        ("get", "/api/chat/conversations"),
        ("delete", "/api/account"),
        ("post", "/api/admin/refresh-listings"),
    ],
)
def test_protected_routes_require_token(client, method, path):
    r = getattr(client, method)(path)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"


@respx.mock
def test_expired_token_is_rejected(client):
    respx.get(USER_URL).mock(return_value=httpx.Response(401, json={"msg": "invalid JWT"}))
    r = client.get("/api/profile", headers={"Authorization": "Bearer expired"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "session_expired"


@respx.mock
def test_unverified_email_is_forbidden(client):
    respx.get(USER_URL).mock(return_value=httpx.Response(200, json={"id": "u1", "email": "a@b.co", "email_confirmed_at": None}))
    r = client.get("/api/profile", headers={"Authorization": "Bearer t"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "email_not_verified"


@respx.mock
def test_valid_token_reaches_rls_scoped_database_with_user_jwt(client):
    respx.get(USER_URL).mock(
        return_value=httpx.Response(
            200, json={"id": "11111111-1111-1111-1111-111111111111", "email": "a@b.co", "email_confirmed_at": "2026-01-01T00:00:00Z"}
        )
    )
    rest = respx.get(url__startswith="https://test-project.supabase.co/rest/v1/profiles").mock(return_value=httpx.Response(200, json=[]))
    r = client.get("/api/profile", headers={"Authorization": "Bearer user-jwt"})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "profile_missing"
    # The database call carried the USER's token (RLS applies), not the service key.
    sent = rest.calls[0].request.headers
    assert sent["Authorization"] == "Bearer user-jwt"
    assert sent["apikey"] == "anon-test-key"


@respx.mock
def test_token_verification_is_cached(client):
    route = respx.get(USER_URL).mock(return_value=httpx.Response(401))
    for _ in range(2):
        client.get("/api/profile", headers={"Authorization": "Bearer bad"})
    assert route.call_count == 2  # failures are not cached


@respx.mock
def test_successful_verification_is_cached(client):
    route = respx.get(USER_URL).mock(return_value=httpx.Response(200, json={"id": "u", "email": "e", "email_confirmed_at": "x"}))
    auth.verify_token("good")
    auth.verify_token("good")
    assert route.call_count == 1


def test_unexpected_errors_return_json_500_with_cors():
    app = create_app()
    app.dependency_overrides[auth.get_ctx] = lambda: (_ for _ in ()).throw(KeyError(0))
    c = TestClient(app, raise_server_exceptions=False)
    r = c.get("/api/dashboard", headers={"Authorization": "Bearer x", "Origin": "http://localhost:5173"})
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "internal_error"
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
    # The connection stays usable: a following request succeeds.
    assert c.get("/api/health").status_code == 200


def test_validation_errors_do_not_echo_input(client, monkeypatch):
    monkeypatch.setattr(auth, "verify_token", lambda t: auth.CurrentUser("u", "e", t, True))
    r = client.post(
        "/api/interviews",
        json={
            "interview_type": "technical",
            "experience_level": "fresher",
            "difficulty": 9,
            "duration_minutes": 30,
            "secret": "my-resume-text",
        },
        headers={"Authorization": "Bearer x"},
    )
    assert r.status_code == 422
    assert "my-resume-text" not in r.text
    assert r.json()["error"]["code"] == "validation_failed"
