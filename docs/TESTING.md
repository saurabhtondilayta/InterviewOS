# Testing

## Automated

**Backend** (`cd backend && pytest`) — no network; HTTP is mocked with respx.
- `test_adaptive.py` — plan building, topic selection, difficulty adjustment, follow-up rules
- `test_rubric.py` — weights, coding/system-design track separation, aggregation, resume score
- `test_resume_parser.py` — real PDF/DOCX extraction, spoofed/oversized/empty/scanned files, contact redaction
- `test_ai.py` — strict JSON-schema conversion for every AI schema, repair retry, 429/timeout/auth handling, prompt-injection containment
- `test_auth_and_api.py` — protected routes, expired/unverified tokens, RLS-scoped DB calls carry the user JWT, no input echo in errors
- `test_companies.py` — role matching, skill extraction, robots.txt handling

**Frontend** (`cd frontend && npm test`)
- `validation.test.ts` — registration/OTP/password/resume-file validation, auth error messages
- `api.test.ts` — bearer token, structured errors, 401 handling, uploads, network errors
- `guards.test.tsx` — protected routes, onboarding redirect, guest-only pages

**Database RLS** (`supabase test db`, requires the Supabase CLI and local stack via Docker)
- `supabase/tests/database/rls.test.sql` — 25 pgTAP assertions: profile created only after verification; cross-user reads/updates/deletes blocked; users cannot forge evaluations, usage logs, companies or admin rows; anon blocked.

**Integration check** (`cd backend && python -m scripts.check_setup`) — read-only check against your real Supabase project and xAI key.

## Manual end-to-end checklist (Definition of Done)
1. Register with your own details → an email with a code arrives.
2. Enter a wrong code → clear error; wait/resend → cooldown is enforced; enter the right code → onboarding.
3. Log out, log in; refresh the page → still logged in.
4. Complete onboarding; edit the profile later in Settings.
5. Upload your resume (PDF or DOCX) → appears in the list; download works.
6. Analyse it for a target role (optionally with a pasted JD) → report, score explanation, Markdown download.
7. Open a company, pick a role → generate a brief (labelled general vs listing-specific).
8. Start a mock interview from the company page.
9. Answer by voice (Chrome/Edge) and by text; deny microphone permission once to see the fallback.
10. See per-answer evaluation, difficulty changes and at least one follow-up question.
11. End the interview → report with dimension chart, topics, per-question review.
12. Generate a 7-day learning plan; tick tasks; see progress on the dashboard.
13. Chat with the coach; reload → history persists; clear and delete a conversation.
14. Log out and back in → all of the above is still there. Export data; optionally delete the account.
