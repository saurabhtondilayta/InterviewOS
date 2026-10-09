"""Verify that the external integrations are configured correctly.

Usage (from backend/):  python -m scripts.check_setup

Checks, without modifying anything:
  1. required environment variables are present,
  2. Supabase REST is reachable and the InterviewOS tables exist (migrations applied),
  3. reference data is seeded (companies, job roles),
  4. the private 'resumes' storage bucket exists,
  5. the xAI API key is accepted and the configured models are available.
Secrets are never printed.
"""

import sys

import httpx

from app.config import get_settings

OK, FAIL, WARN = "[ ok ]", "[FAIL]", "[warn]"
failures = 0


def report(status: str, msg: str) -> None:
    global failures
    if status == FAIL:
        failures += 1
    print(f"{status} {msg}")


def main() -> int:
    s = get_settings()

    configured: dict[str, bool] = {}
    for name in ("supabase_url", "supabase_anon_key", "supabase_service_role_key", "ai_api_key"):
        value = getattr(s, name)
        configured[name] = bool(value) and not value.startswith(("PASTE_", "your-")) and "YOUR-PROJECT-REF" not in value
        report(OK if configured[name] else FAIL, f"{name.upper()} {'is set' if configured[name] else 'is missing (still a placeholder)'}")
    if not all(configured[n] for n in ("supabase_url", "supabase_anon_key", "supabase_service_role_key")):
        print("\nFill in the Supabase values in backend/.env (see backend/.env.example) and run again.")
        return 1

    svc = {"apikey": s.supabase_service_role_key, "Authorization": f"Bearer {s.supabase_service_role_key}"}
    with httpx.Client(timeout=15) as client:
        # Tables
        for table in ("profiles", "resumes", "interview_sessions", "answer_evaluations", "chat_messages", "usage_logs"):
            r = client.get(f"{s.supabase_url}/rest/v1/{table}", params={"select": "*", "limit": "0"}, headers=svc)
            report(OK if r.status_code == 200 else FAIL, f"table public.{table} ({r.status_code})")

        # Reference data
        for table in ("companies", "job_roles"):
            r = client.get(
                f"{s.supabase_url}/rest/v1/{table}", params={"select": "id"}, headers={**svc, "Prefer": "count=exact", "Range": "0-0"}
            )
            count = r.headers.get("content-range", "*/0").split("/")[-1]
            report(OK if r.status_code in (200, 206) and count not in ("0", "*") else WARN, f"{table}: {count} rows")

        # Storage bucket
        r = client.get(f"{s.supabase_url}/storage/v1/bucket/{s.resume_bucket}", headers=svc)
        if r.status_code == 200:
            public = r.json().get("public")
            report(
                OK if not public else FAIL,
                f"storage bucket '{s.resume_bucket}' exists and is {'PUBLIC (must be private!)' if public else 'private'}",
            )
        else:
            report(FAIL, f"storage bucket '{s.resume_bucket}' not found ({r.status_code}); run the storage migration")

        # Anonymous access must be blocked
        r = client.get(f"{s.supabase_url}/rest/v1/profiles", params={"select": "id", "limit": "1"}, headers={"apikey": s.supabase_anon_key})
        blocked = r.status_code in (401, 403) or (r.status_code == 200 and r.json() == [])
        report(OK if blocked else FAIL, "anonymous clients cannot read profiles")

        # AI provider
        if not configured["ai_api_key"]:
            print("[skip] AI check skipped until AI_API_KEY is set")
            print(f"\n{failures} check(s) failed.")
            return 1
        r = client.get(f"{s.ai_base_url}/models", headers={"Authorization": f"Bearer {s.ai_api_key}"})
        if r.status_code == 200:
            ids = {m.get("id") for m in r.json().get("data", [])}
            report(OK, f"AI API key accepted by {s.ai_base_url} ({len(ids)} models visible)")
            for model in {s.ai_model, s.ai_chat_model}:
                report(
                    OK if model in ids else FAIL,
                    f"model '{model}' {'available' if model in ids else 'not available for this key/provider'}",
                )
        else:
            report(FAIL, f"AI provider rejected the API key ({r.status_code})")

    if not failures:
        # One tiny real request proves structured (JSON-schema) output works end to end.
        from app.ai.client import AIClient
        from app.ai.schemas import ConversationTitleAI
        from app.errors import AppError

        try:
            result, model = AIClient().structured(
                [{"role": "user", "content": "Give a 3-word title for a chat about DSA interview preparation."}],
                ConversationTitleAI,
                user_id=None,
                feature="setup_check",
                check_limits=False,
            )
            report(OK, f"structured AI response from '{model}': {result.title!r}")
        except AppError as exc:
            report(FAIL, f"structured AI request failed: {exc.message}")

    print("\nAll checks passed." if not failures else f"\n{failures} check(s) failed.")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
