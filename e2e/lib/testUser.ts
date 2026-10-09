import { env } from './env'

const admin = { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, 'Content-Type': 'application/json' }

async function findUserId(email: string): Promise<string | null> {
  // The admin API lists users page by page; the test project is small.
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`${env.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=100`, { headers: admin })
    if (!r.ok) throw new Error(`Could not list users: ${r.status} ${await r.text()}`)
    const users: { id: string; email: string }[] = (await r.json()).users ?? []
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (users.length < 100) return null
  }
  return null
}

/**
 * Makes sure the test account exists, is email-confirmed and has the expected password.
 * Registration details mirror what the sign-up form sends.
 */
export async function ensureTestUser(): Promise<string> {
  const existing = await findUserId(env.email)
  if (existing) {
    const r = await fetch(`${env.supabaseUrl}/auth/v1/admin/users/${existing}`, {
      method: 'PUT',
      headers: admin,
      body: JSON.stringify({ password: env.password, email_confirm: true }),
    })
    if (!r.ok) throw new Error(`Could not reset test user: ${r.status} ${await r.text()}`)
    return existing
  }
  const r = await fetch(`${env.supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({
      email: env.email,
      password: env.password,
      email_confirm: true,
      user_metadata: {
        full_name: env.fullName,
        college: 'Test Institute of Technology',
        degree: 'B.Tech',
        branch: 'Computer Science (Cloud Computing)',
        current_year: '3',
        graduation_year: String(new Date().getFullYear() + 1),
        preferred_role: 'Cloud Engineer',
        skills: ['Python', 'AWS', 'SQL', 'Linux'],
        years_experience: '0',
      },
    }),
  })
  if (!r.ok) throw new Error(`Could not create test user: ${r.status} ${await r.text()}`)
  return (await r.json()).id
}

/** Permanently deletes the test account and all of its data (used by `npm run cleanup`). */
export async function deleteTestUser(): Promise<boolean> {
  const id = await findUserId(env.email)
  if (!id) return false
  // Remove stored resume files first, then the auth user (all rows cascade).
  const list = await fetch(`${env.supabaseUrl}/storage/v1/object/list/resumes`, { method: 'POST', headers: admin, body: JSON.stringify({ prefix: id }) })
  const files: { name: string }[] = list.ok ? await list.json() : []
  if (files.length) {
    await fetch(`${env.supabaseUrl}/storage/v1/object/resumes`, { method: 'DELETE', headers: admin, body: JSON.stringify({ prefixes: files.map((f) => `${id}/${f.name}`) }) })
  }
  const r = await fetch(`${env.supabaseUrl}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin })
  return r.ok
}
