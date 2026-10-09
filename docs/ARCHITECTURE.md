# Architecture

## In simple terms
InterviewOS has three parts:

1. **The website (frontend)** — what students see. Built with React. It handles sign-up and login directly with Supabase Auth, which sends the email verification code. For everything else, it calls our backend and passes along the user's login token.
2. **The backend (FastAPI, Python)** — the "brain". It checks who the user is, reads and writes their data, extracts text from resumes, talks to the AI provider (Groq by default, xAI Grok optional), runs the interview algorithm and calculates scores. The AI key lives only here.
3. **Supabase** — the database (PostgreSQL), file storage for resumes, and the login system. Every table with personal data has rules (Row Level Security) so a user can only ever see their own rows.

## Request flow example: answering an interview question
1. The browser sends `POST /api/interviews/{id}/questions/{qid}/answer` with the user's access token.
2. The backend asks Supabase Auth whether the token is valid (cached for 60 s).
3. The backend reads the session and question **using the user's token**, so RLS guarantees they belong to the user.
4. It stores the answer, asks the AI to grade it against the rubric (JSON schema enforced and validated), computes the score with our own formula, updates the adaptive state (difficulty and topic mastery), and stores the evaluation with the service role.
5. The browser shows the feedback. The next call to `/next` picks the next topic and difficulty.

## Security model
| Concern | Approach |
|---|---|
| Credentials | Supabase Auth only; no custom password or OTP storage |
| API keys | `AI_API_KEY` and the service-role key exist only in backend env vars |
| Authorisation | Every endpoint requires a verified Supabase token; data reads use the user's JWT → RLS |
| Score integrity | Clients may not insert/update evaluations, reports, analyses or usage logs (no grants); only the backend writes them |
| Column-level limits | Clients can update only whitelisted profile columns, task completion, conversation titles |
| Files | Private bucket, per-user folder policies, magic-byte + size + zip-bomb checks, 2-minute signed download URLs, originals never overwritten |
| Prompt injection | Resume/JD/answer/company text is wrapped in `<untrusted:…>` blocks, closing tags are neutralised, system prompt forbids following embedded instructions |
| Data minimisation | Email, phone and profile URLs are redacted from resume text before it is sent to the AI; names/emails are never included in prompt context |
| Rate limiting | Per-user hourly/daily AI limits counted from `usage_logs` (works across instances); Supabase limits OTP sends |
| Logging | Usage metadata only (feature, model, tokens, latency, status); no prompts, resumes, answers, tokens or keys |
| Output safety | AI Markdown is rendered without raw HTML; only http(s) links, opened with `noopener noreferrer` |
| Deletion | `DELETE /api/account` removes storage objects then the auth user; all rows cascade |

## Backend modules
- `app/auth.py` — token verification, request context (user + RLS-scoped client)
- `app/db.py` — user-scoped and service-role PostgREST/Storage clients
- `app/ai/client.py` — provider-neutral AI client (Groq / xAI): structured outputs, validation + one repair retry, retries with backoff, error translation, usage logging
- `app/ai/prompts.py` — **all** prompt templates (versioned via `PROMPT_VERSION`)
- `app/ai/schemas.py` — Pydantic schemas for every AI output
- `app/services/interview/adaptive.py` — pure, unit-tested adaptive algorithm
- `app/services/interview/rubric.py` — documented scoring model
- `app/services/interview/engine.py` — session orchestration and persistence
- `app/services/resume_parser.py` — PDF/DOCX validation, extraction, redaction
- `app/services/companies.py` — verified company context, official job-board adapters, robots-aware refresh

## Voice implementation (honest description)
- Questions are spoken with the browser's `speechSynthesis`.
- Answers use the browser's `SpeechRecognition` with interim results, so text appears while the user speaks (near-live). This is not a streaming audio pipeline to our server: only the final, user-reviewed text is sent to InterviewOS.
- Recording starts only on "Start speaking" and stops on "Stop", on submit, or when leaving the page.
- If the API is unavailable, permission is denied, or recognition errors, the user can type.

## Extending code execution
Code is not executed on the application server. To add execution safely, run submissions in an isolated sandbox (for example a self-hosted Judge0 instance or a container with no network, CPU/memory/time limits and a read-only filesystem), call it from a new backend service, and keep its results in a separate field from the AI review.
