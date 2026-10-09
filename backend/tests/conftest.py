import os

import pytest

# Deterministic, fake configuration for tests. No real network calls are made: HTTP is mocked.
os.environ.update(
    {
        "SUPABASE_URL": "https://test-project.supabase.co",
        "SUPABASE_ANON_KEY": "anon-test-key",
        "SUPABASE_SERVICE_ROLE_KEY": "service-test-key",
        "AI_API_KEY": "ai-test-key",
        "AI_BASE_URL": "https://api.test-ai.local/v1",
        "AI_MAX_RETRIES": "1",
    }
)


@pytest.fixture(autouse=True)
def _fresh_settings():
    from app.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def no_usage(monkeypatch):
    """Disable DB-backed usage logging / rate limiting for AI client tests."""
    from app import usage

    calls: list[dict] = []
    monkeypatch.setattr(usage, "check_rate_limit", lambda user_id, feature: None)
    monkeypatch.setattr(usage, "record", lambda *a, **k: calls.append({"args": a, **k}))
    return calls
