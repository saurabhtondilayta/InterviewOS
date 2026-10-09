/**
 * InterviewOS step-by-step browser journey.
 *
 * Runs in ONE shared browser window, in order:
 *   1. log in  ->  2-10. exercise each feature  ->  11. hand the browser over to you.
 *
 * Every step is its own test, so the report shows exactly which one passed or failed.
 * If a step fails, the remaining steps are skipped (they depend on the session).
 */
import { type Browser, type Page, expect, test } from '@playwright/test'
import { env } from '../lib/env'
import { sampleResumePdf } from '../lib/samplePdf'
import { ensureTestUser } from '../lib/testUser'

test.describe.configure({ mode: 'serial' })

let page: Page
const AI_TIMEOUT = 150_000 // AI responses on the free tier can take a while

/** Pause between AI-heavy steps to respect the AI provider's per-minute token limit. */
async function aiCooldown(label: string) {
  if (env.aiPauseMs > 0) {
    console.log(`   … waiting ${env.aiPauseMs / 1000}s before "${label}" (AI rate limit)`)
    await page.waitForTimeout(env.aiPauseMs)
  }
}

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  await ensureTestUser()
  const context = await browser.newContext()
  page = await context.newPage()
})

// ---------------------------------------------------------------------------
test('01 · log in', async () => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByLabel('Email address').fill(env.email)
  await page.getByLabel('Password').fill(env.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  // First login lands on onboarding; later logins on the dashboard. The app passes through
  // /dashboard briefly before redirecting, so wait for the page that actually renders.
  await expect(page.getByRole('heading', { name: /Welcome, Asha|Good (morning|afternoon|evening), Asha/ })).toBeVisible({ timeout: 30_000 })
})

test('02 · onboarding (first login only)', async () => {
  if (!page.url().includes('/onboarding')) {
    test.info().annotations.push({ type: 'note', description: 'Onboarding already completed earlier - skipped.' })
    return
  }
  await expect(page.getByRole('heading', { name: /Welcome, Asha/ })).toBeVisible()
  // Education step: save the pre-filled details from registration.
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page.getByText('Profile saved').first()).toBeVisible()
  // Skip the remaining optional steps and finish.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Skip this step' }).click()
  await page.getByRole('button', { name: 'Finish setup' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
})

test('03 · dashboard shows the real profile', async () => {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening), Asha/ })).toBeVisible()
  await expect(page.getByText('Profile completion').first()).toBeVisible()
  await expect(page.getByText('Cloud Engineer').first()).toBeVisible()
})

test('04 · edit profile skills in settings', async () => {
  await page.goto('/settings')
  await page.getByRole('tab', { name: 'Skills' }).click()
  const skills = page.getByLabel('Technical skills')
  await skills.fill('Kubernetes')
  await skills.press('Enter')
  await page.getByRole('tabpanel').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Profile saved').first()).toBeVisible()
  await expect(page.getByText('Kubernetes').first()).toBeVisible()
})

test('05 · upload a resume', async () => {
  await page.goto('/resume')
  await page.getByLabel('Choose resume file').setInputFiles(sampleResumePdf())
  await expect(page.getByText('Resume uploaded and text extracted')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Asha_Tester_Resume.pdf').first()).toBeVisible()
})

test('06 · AI resume analysis', async () => {
  await aiCooldown('resume analysis')
  await page.goto('/resume')
  await page.getByLabel('Target role').fill('Cloud Engineer')
  await page.getByLabel('Job description (optional)').fill('Cloud Engineer: AWS, Linux, Terraform, Kubernetes, CI/CD, networking fundamentals.')
  await page.getByRole('button', { name: 'Analyse resume' }).click()
  await expect(page).toHaveURL(/\/resume\/analysis\//, { timeout: AI_TIMEOUT })
  await expect(page.getByRole('heading', { name: 'Analysis for Cloud Engineer' })).toBeVisible()
  await expect(page.getByText('Practice score').first()).toBeVisible()
  await page.getByRole('tab', { name: 'Job description match' }).click()
  await expect(page.getByText('Requirements you meet')).toBeVisible()
})

test('07 · company explorer and preparation brief', async () => {
  await aiCooldown('preparation brief')
  await page.goto('/companies')
  await page.getByLabel('Search companies').fill('Google')
  await page.getByRole('link', { name: 'Google' }).click()
  await expect(page.getByRole('heading', { name: 'Google' })).toBeVisible()
  await page.getByLabel('Role framework').selectOption({ label: 'Cloud Engineer' })
  await page.getByRole('button', { name: 'Generate preparation brief' }).click()
  await expect(page.getByText('Your preparation brief')).toBeVisible({ timeout: AI_TIMEOUT })
  await expect(page.getByText('General role practice').first()).toBeVisible()
})

test('08 · adaptive mock interview (text answers)', async () => {
  await aiCooldown('mock interview')
  await page.goto('/interview/new')
  await page.getByRole('radio', { name: /^Technical/ }).click()
  await page.getByLabel('Role framework').selectOption({ label: 'Cloud Engineer' })
  await page.getByLabel('Duration').selectOption('10')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.getByRole('button', { name: 'Create interview' }).click()
  await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}$/)

  await page.getByRole('button', { name: 'Start interview' }).click()
  await expect(page.getByText(/AI interviewer · Question 1/)).toBeVisible({ timeout: AI_TIMEOUT })
  await page
    .getByLabel('Your answer')
    .fill(
      'I would explain the concept first, then give an example. For instance, in AWS a VPC is divided into public and private subnets; ' +
        'public subnets route through an internet gateway while private ones use a NAT gateway. Security groups act as stateful firewalls.',
    )
  await page.getByRole('button', { name: 'Submit answer' }).click()
  await expect(page.getByText(/Answer score|Coding score|System Design score/)).toBeVisible({ timeout: AI_TIMEOUT })
  await expect(page.getByText(/Adaptive engine:/)).toBeVisible()

  await page.getByRole('button', { name: 'End interview' }).click()
  await page.getByRole('button', { name: 'End and see report' }).click()
  await expect(page).toHaveURL(/\/results$/, { timeout: AI_TIMEOUT })
  await expect(page.getByText('Overall practice score')).toBeVisible({ timeout: AI_TIMEOUT })
  await expect(page.getByText('Question-by-question review')).toBeVisible()
})

test('09 · AI career coach chat', async () => {
  await aiCooldown('coach chat')
  await page.goto('/coach')
  const box = page.getByLabel('Message')
  await box.fill('In two sentences: what should I revise first for cloud engineer interviews?')
  await box.press('Enter')
  await expect(page.getByText('AI-generated', { exact: true }).first()).toBeVisible({ timeout: AI_TIMEOUT })
  // The conversation is saved and appears in the history list.
  await expect(page).toHaveURL(/\/coach\?c=/)
})

test('10 · learning plan and task tracking', async () => {
  await aiCooldown('learning plan')
  await page.goto('/learning')
  const newPlan = page.getByRole('button', { name: 'New plan' })
  if (await newPlan.isVisible()) await newPlan.click()
  await page.getByRole('button', { name: 'Generate plan' }).click()
  await expect(page.getByRole('heading', { name: /^Day 1\b/ })).toBeVisible({ timeout: AI_TIMEOUT })
  // Click the first task like a user would (the real checkbox is visually hidden behind a styled box).
  await page.locator('label:has(input[type="checkbox"])').first().click()
  await expect(page.getByRole('checkbox').first()).toBeChecked()
  await expect(page.getByText(/^1\/\d+ · \d+%$/)).toBeVisible() // progress saved on the server
  await page.goto('/dashboard')
  await expect(page.getByText(/1\/\d+ tasks/)).toBeVisible()
})

test('11 · your turn: interact with the app', async () => {
  test.skip(process.env.HEADLESS === '1' || process.env.NO_PAUSE === '1', 'Hand-over disabled (headless / NO_PAUSE)')
  test.setTimeout(0) // no time limit while you explore
  await page.goto('/dashboard')
  console.log('\n   ✔ Automated steps finished. The browser is yours now - logged in as', env.email)
  console.log('     Explore freely. When you are done, click "Resume" (▶) in the Playwright Inspector or close the browser.\n')
  await page.pause()
})
