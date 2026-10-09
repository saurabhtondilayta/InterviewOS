import fs from 'node:fs'
import path from 'node:path'

/** Reads backend/.env so the tests use the same Supabase project as the app (no duplicated secrets). */
function loadBackendEnv(): Record<string, string> {
  const file = path.resolve(import.meta.dirname, '..', '..', 'backend', '.env')
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Configure the backend first (see README).`)
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const backend = loadBackendEnv()

export const env = {
  supabaseUrl: backend.SUPABASE_URL,
  anonKey: backend.SUPABASE_ANON_KEY,
  serviceKey: backend.SUPABASE_SERVICE_ROLE_KEY,
  apiUrl: process.env.E2E_API_URL ?? 'http://127.0.0.1:8000',
  // A dedicated test account. It is created (already email-confirmed) through the Supabase admin API,
  // so no verification email is needed. Override with E2E_EMAIL / E2E_PASSWORD to use your own account.
  email: process.env.E2E_EMAIL ?? 'e2e-tester@interviewos-test.dev',
  password: process.env.E2E_PASSWORD ?? 'E2e-Tester-Passw0rd!',
  fullName: 'Asha Tester',
  // Pause between AI-heavy steps so the Groq free tier (about 8K tokens/minute) isn't exceeded.
  aiPauseMs: Number(process.env.AI_PAUSE_MS ?? 20_000),
}

for (const [k, v] of Object.entries({ SUPABASE_URL: env.supabaseUrl, SUPABASE_ANON_KEY: env.anonKey, SUPABASE_SERVICE_ROLE_KEY: env.serviceKey })) {
  if (!v || v.startsWith('PASTE_') || v.startsWith('your-')) throw new Error(`${k} is not configured in backend/.env`)
}
