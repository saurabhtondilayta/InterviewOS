/**
 * Just log in and hand the browser over (no automated feature steps).
 * Run with:  npm run interactive
 */
import { expect, test } from '@playwright/test'
import { env } from '../lib/env'
import { ensureTestUser } from '../lib/testUser'

test('log in, then explore yourself', async ({ page }) => {
  test.setTimeout(0)
  await ensureTestUser()
  await page.goto('/login')
  await page.getByLabel('Email address').fill(env.email)
  await page.getByLabel('Password').fill(env.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: /Welcome,|Good (morning|afternoon|evening),/ })).toBeVisible({ timeout: 30_000 })
  console.log(`\n   ✔ Logged in as ${env.email}. The browser is yours - press Resume (▶) in the Inspector when done.\n`)
  await page.pause()
})
