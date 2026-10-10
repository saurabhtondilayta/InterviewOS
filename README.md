# InterviewOS

AI-powered interview preparation for students: resume analysis, adaptive mock interviews (voice or text), coding practice, company-and-role preparation, an AI career coach, and personalised learning plans — with every piece of user data stored in Supabase under Row Level Security.

> AI feedback in InterviewOS is **practice guidance**, not an objective measure of employability. Company information is shown with its official source and verification date, and general practice is never presented as official company material.

**Live demo:** https://interviewos-gamma.vercel.app · API: https://interviewos-api.vercel.app/api/docs

## Features

| Area | What it does |
|---|---|
| Auth | Email + password sign-up with **email OTP verification** (Supabase Auth), login, logout, OTP password reset, session persistence, protected routes |
| Onboarding & profile | Education, skills, languages, projects, internships, certifications, target roles/companies, improvement areas; editable any time |
| Resume analyzer | PDF/DOCX upload to a private bucket, server-side text extraction, contact-detail redaction, AI analysis in 10 sections, documented practice score, JD comparison, bullet rewrites, Markdown report download |
| Mock interviews | 8 interview types, explainable **adaptive algorithm** (topic selection, difficulty adjustment, follow-ups), 265-question original bank mixed with AI questions, cross-session repeat avoidance, resume deep-dive questions, rubric scoring, final report |
| Voice room | AI interviewer speaks questions and spoken feedback (server TTS, browser-voice fallback); answers recorded and transcribed server-side (Whisper); hands-free conversation mode; editable transcript; text fallback |
| Coding practice | Generated problems; AI code review on a separate technical track (code is not executed) |
| Companies | Real employers with official URLs and verification dates; listings only from official sources (Greenhouse/Lever public APIs or admin-registered official URLs); refresh workflow |
| AI coach | Personalised chat with persistent history, suggested prompts, copy, clear, delete |
| Progress | Dashboard from real records only, interview history, per-type trend charts, 7/30-day learning plans with task tracking |
| Privacy | Data export and full account deletion |
| Company hiring (HR) | Sign up as **Company HR** → company workspace with team roles (owner/admin/recruiter); create assessments as **AI interviews** or **live 1:1 video interviews** (HR decides); invite candidates by email or share an open application link; per-candidate report with AI scores, transcript, resume, integrity score and proctoring timeline; HR scorecard, notes and hire/reject decision |
| Live video interview | Browser-to-browser WebRTC call (Supabase Realtime signalling, STUN; optional TURN), mute/camera controls, AI-suggested questions tailored to the role and the candidate's resume, live scorecard |
| AI proctoring | With candidate consent: in-browser MediaPipe checks for no face, multiple people, looking away, phone in view, plus tab switches, window blur, fullscreen exit and copy/paste. Only events and a few low-res snapshots at flagged moments are uploaded — no video recording. Visible **only to the company's HR members** (RLS); candidates never see it. Integrity score is a transparent penalty sum for human review, not an automatic verdict |

## Architecture (short version)

```
Browser (React + Vite + TS)
  │  Supabase Auth (anon key): sign-up, OTP verify, login, password reset
  │  HTTPS + Bearer <user access token>
  ▼
FastAPI backend ──────────────► AI provider: Groq or xAI Grok (key server-side only)
  │  verifies token with Supabase Auth
  │  reads as the USER (RLS enforced)
  │  writes AI-produced records with the service role after ownership checks
  ▼
Supabase: Postgres (RLS on every user table) + private Storage bucket "resumes"
```

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository layout

```
backend/            FastAPI app
  app/ai/           AI client, prompt templates, output schemas
  app/services/     resume parsing, interview engine (adaptive.py, rubric.py), companies, coach, plans
  app/routers/      HTTP API
  scripts/          check_setup.py (verifies Supabase + AI provider configuration)
  tests/            pytest suite
frontend/           React + Vite + TypeScript + Tailwind
  src/pages/        all application pages
  src/components/   UI kit, layout, interview, coach, profile components
  src/lib/          API client, Supabase client, validation, speech helpers
  src/test/         Vitest suite
supabase/
  migrations/       schema, RLS policies, storage bucket, reference data
  tests/database/   pgTAP tests for Row Level Security
docs/               architecture, API, scoring, setup, deployment, testing
e2e/                Playwright browser automation: step-by-step journey + interactive hand-over
```

## Prerequisites

- Node.js 20+ (developed with 24) and npm
- Python 3.11+ (developed with 3.14)
- A Supabase project (free tier works) — https://supabase.com
- An AI API key: **Groq** (free tier, https://console.groq.com/keys) or xAI Grok (https://console.x.ai). Any OpenAI-compatible provider with JSON-schema output works; set `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`.
- Optional: Supabase CLI (for `supabase db push` / `supabase test db`), Git

## Setup

1. **Supabase** — follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md): run the four migrations, **edit the "Confirm signup" and "Reset password" email templates to include `{{ .Token }}`**, and copy your keys.
2. **Backend**
   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
   pip install -r requirements-dev.txt
   copy .env.example .env          # macOS/Linux: cp .env.example .env  — then fill it in
   python -m scripts.check_setup   # verifies Supabase tables, bucket, RLS and AI key
   uvicorn app.main:app --reload --port 8000
   ```
   API docs: http://localhost:8000/api/docs
3. **Frontend**
   ```bash
   cd frontend
   npm install
   copy .env.example .env.local    # then fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
   npm run dev
   ```
   Open http://localhost:5173

## Commands

| Where | Command | Purpose |
|---|---|---|
| backend | `uvicorn app.main:app --reload` | dev server |
| backend | `pytest` | unit/API tests |
| backend | `ruff check app tests` / `ruff format app tests` | lint / format |
| backend | `python -m scripts.check_setup` | verify live integrations |
| frontend | `npm run dev` / `npm run build` | dev server / production build |
| frontend | `npm test` | Vitest suite |
| frontend | `npm run typecheck` / `npm run lint` | TypeScript / oxlint |
| repo | `supabase test db` | RLS tests (requires Supabase CLI + local stack) |
| e2e | `npm test` / `npm run interactive` | Watch the browser test every feature, then explore yourself (see [e2e/README.md](e2e/README.md)) |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [API reference](docs/API.md) · [Scoring & adaptive algorithm](docs/SCORING.md)
- [Supabase setup](docs/SUPABASE_SETUP.md) · [Company data policy & admin workflow](docs/COMPANY_DATA.md)
- [Deployment](docs/DEPLOYMENT.md) · [Testing](docs/TESTING.md)

## Known limitations

- The natural server voice (Groq Orpheus) requires accepting its model terms once in the Groq console; until then the browser's built-in voice is used. Speech-to-text (Whisper) works without extra setup.
- Coding answers are reviewed by the AI, **not executed**. A sandboxed runner (e.g. a self-hosted Judge0) can be added later — see docs/ARCHITECTURE.md.
- No job listings are pre-seeded: listings must come from official sources via the admin workflow, so a fresh install shows companies with "general role-based practice" until an admin adds listings.
- Proctoring signals are heuristics (a head turn to think can look like "looking away", a phone face-down is invisible). They flag moments for human review; they cannot prove cheating, and they can be evaded by someone determined (e.g. a second device out of frame).
- Live video uses public STUN only by default. Behind strict corporate/college firewalls a TURN relay (`TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`) is needed for the call to connect. Calls are not recorded.
- Supabase's built-in email service is rate-limited and meant for development; configure custom SMTP before real users sign up.
