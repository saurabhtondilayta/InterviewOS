# Deployment

InterviewOS is deployed as **two Vercel projects** from this repository:

| Part | Vercel project | Root directory | Live URL |
|---|---|---|---|
| Frontend (React + Vite) | `interviewos` | `frontend/` | https://interviewos-gamma.vercel.app |
| Backend (FastAPI) | `interviewos-api` | `backend/` | https://interviewos-api.vercel.app (`/api/health`, `/api/docs`) |

## Backend on Vercel (FastAPI as a Python function)
`backend/vercel.json` sets `"framework": "fastapi"`, a 300 s `maxDuration` (AI calls can wait out provider rate limits) and excludes tests/scripts from the bundle. `pyproject.toml` declares `[tool.vercel] entrypoint = "app.main:app"` and the dependencies (kept in sync with `requirements.txt`). `.vercelignore` keeps `.env`, `.venv` and tests out of the upload.

```powershell
cd backend
vercel link --yes --project interviewos-api
# Add each variable from backend/.env.example (use --value; piping from Windows PowerShell 5.1 adds a BOM)
vercel env add SUPABASE_URL production --value "https://<ref>.supabase.co" --no-sensitive --yes
vercel env add SUPABASE_SERVICE_ROLE_KEY production --value "<key>" --sensitive --yes
# ... SUPABASE_ANON_KEY, AI_API_KEY (sensitive), AI_BASE_URL, AI_MODEL, AI_CHAT_MODEL, AI_REASONING_EFFORT,
#     AI_TIMEOUT_SECONDS, AI_MAX_RETRIES, ENVIRONMENT=production,
#     CORS_ORIGINS=https://<frontend>.vercel.app,http://localhost:5173
vercel deploy --prod
```

Vercel limits to keep in mind:
- **Request body ≤ 4.5 MB** → resume uploads are capped at 4 MB in both frontend and backend.
- Functions are stateless: per-user rate limits are counted in the database (`usage_logs`), so they work across instances.

## Frontend on Vercel
`frontend/vercel.json` sets the Vite preset, `dist` output, an SPA rewrite and security headers (`Permissions-Policy` allows the microphone for this origin only).

```powershell
cd frontend
vercel link --yes --project interviewos
vercel env add VITE_SUPABASE_URL production --value "https://<ref>.supabase.co" --no-sensitive --yes
vercel env add VITE_SUPABASE_ANON_KEY production --value "<anon key>" --no-sensitive --yes
vercel env add VITE_API_URL production --value "https://interviewos-api.vercel.app" --no-sensitive --yes
vercel deploy --prod
```
`VITE_*` values are compiled into the browser bundle: only public values (URL, anon key, API URL) belong here.

## Supabase
- Authentication → URL Configuration → **Site URL** = the frontend URL (emails use 6-digit codes, so this only affects links).
- Custom SMTP must be configured for production email (see SUPABASE_SETUP.md).

## Alternative: backend in Docker
`backend/Dockerfile` (listens on `$PORT`, non-root) works on Render, Railway, Fly.io or Cloud Run if you prefer a long-running server.

## Verify a deployment
```powershell
cd e2e
npx cross-env E2E_BASE_URL=https://interviewos-gamma.vercel.app HEADLESS=1 SLOW_MO=0 playwright test tests/journey.spec.ts
```

## Checklist
- [ ] No `.env` files committed (`.gitignore` and `.vercelignore` cover them)
- [ ] Service-role key and AI API key stored as **sensitive** Vercel variables, only in the backend project
- [ ] `CORS_ORIGINS` lists only your frontend origin(s)
- [ ] Email templates contain `{{ .Token }}`
- [ ] HTTPS everywhere (the browser microphone requires a secure context)
