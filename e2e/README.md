# InterviewOS browser automation (Playwright)

Watch a real Chrome window log in, test every feature step by step, and then hand the browser over to you.

## What it does

| Step | What is checked |
|---|---|
| 01 | Log in through the login page |
| 02 | Onboarding on first login (save education, finish setup) |
| 03 | Dashboard shows the real profile (name, target role, completion) |
| 04 | Edit skills in Settings and save |
| 05 | Upload a PDF resume |
| 06 | AI resume analysis with a job description → report page |
| 07 | Company explorer → Google → AI preparation brief |
| 08 | Mock interview: create, start, answer by text, get evaluation, end, see report |
| 09 | AI career coach: send a message, get a reply, conversation saved |
| 10 | Generate a 7-day learning plan, tick a task, progress saved |
| 11 | **Your turn** — the browser stays open and logged in for you to explore |

Steps run in one browser window in order. If one fails, the rest are skipped and you get a screenshot, video and trace.

## Test account
A dedicated account `e2e-tester@interviewos-test.dev` is created automatically through the Supabase admin API (already email-verified, so no email is sent). It reads the Supabase keys from `../backend/.env`, so there is nothing extra to configure.

Use your own account instead:
```powershell
$env:E2E_EMAIL="you@example.com"; $env:E2E_PASSWORD="YourPassword1"; npm test
```

## First-time setup
```powershell
cd e2e
npm install
npx playwright install chromium
```

## Commands
| Command | What it does |
|---|---|
| `npm run demo` | **For presentations:** fresh test account (so onboarding is shown), extra-slow clicks, then hands over to you |
| `npm run ui` | Playwright UI mode: list of steps, live browser view, timeline — click ▶ to run |
| `npm test` | Visible browser, slowed down so you can follow, then hands over to you (step 11) |
| `npm run interactive` | Only logs in, then hands over to you |
| `npm run test:headless` | Same checks without a window (fast, for verification) |
| `npm run report` | Open the HTML report of the last run |
| `npm run cleanup` | Delete the test account and all of its data |

The backend and frontend are started automatically if they are not already running.

**Step 11 / interactive mode:** the Playwright Inspector window opens next to the browser. Use the app freely; click **Resume (▶)** in the Inspector, or close the browser, to finish.

## Settings (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `SLOW_MO` | `250` | Milliseconds between actions (0 = full speed) |
| `AI_PAUSE_MS` | `20000` | Pause before each AI-heavy step so the Groq free tier (~8K tokens/min) isn't exceeded |
| `NO_PAUSE` | – | `1` skips the hand-over step |
| `HEADLESS` | – | `1` runs without a window |
| `E2E_BASE_URL` | `http://localhost:5173` | Frontend URL |

A full run takes about 3–4 minutes, mostly waiting for AI responses and the rate-limit pauses.
