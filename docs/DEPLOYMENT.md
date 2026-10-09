# Deployment

## Backend (Docker: Render, Railway, Fly.io or Cloud Run)
The backend ships with `backend/Dockerfile` (listens on `$PORT`, defaults to 8000, runs as a non-root user).

Example on **Render**:
1. New → Web Service → connect the repository, root directory `backend`, runtime Docker.
2. Environment variables (from `backend/.env.example`): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_CHAT_MODEL`, `CORS_ORIGINS=https://<your-app>.vercel.app`, `ENVIRONMENT=production`.
3. Health check path: `/api/health`.
4. After deploy, run `python -m scripts.check_setup` in the service shell.

AI calls can take up to ~60 s; make sure the host's request timeout is ≥ 120 s (Render's default is fine).

## Frontend (Vercel)
1. Import the repository, set **Root Directory** to `frontend` (framework preset: Vite).
2. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=https://<your-backend-host>`.
3. `vercel.json` adds the SPA rewrite and security headers (`Permissions-Policy` allows the microphone for this origin only).

## Supabase
- Authentication → URL Configuration → Site URL = your Vercel URL.
- Configure custom SMTP for production email.
- Re-run `scripts/check_setup` against production.

## Checklist
- [ ] No `.env` files committed (`git status` shows none; `.gitignore` covers them)
- [ ] Service-role key and AI API key only in backend host settings
- [ ] `CORS_ORIGINS` contains only your frontend origin(s)
- [ ] Email templates contain `{{ .Token }}`
- [ ] HTTPS on both frontend and backend (the browser microphone requires a secure context)
