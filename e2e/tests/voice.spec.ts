/**
 * Voice interview check: the browser's microphone is replaced by a recorded answer
 * (fixtures/spoken-answer.wav), so we can verify record -> server transcription -> evaluation.
 *
 * Run with:  npm run test:voice
 */
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { env } from '../lib/env'
import { ensureTestUser } from '../lib/testUser'

const wav = path.resolve(import.meta.dirname, '..', 'fixtures', 'spoken-answer.wav')

test.use({
  permissions: ['microphone'],
  launchOptions: {
    slowMo: Number(process.env.SLOW_MO ?? 250),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`],
  },
})

test('voice interview: speak an answer, get it transcribed and evaluated', async ({ page }) => {
  test.setTimeout(5 * 60_000)
  await ensureTestUser()
  await page.goto('/login')
  await page.getByLabel('Email address').fill(env.email)
  await page.getByLabel('Password').fill(env.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: /Welcome,|Good (morning|afternoon|evening),/ })).toBeVisible({ timeout: 30_000 })

  // Create a technical interview in voice mode.
  await page.goto('/interview/new')
  await page.getByRole('radio', { name: /^Technical/ }).click()
  await page.getByLabel('Role framework').selectOption({ label: 'Cloud Engineer' })
  await page.getByLabel('Duration').selectOption('10')
  await page.getByRole('button', { name: 'Voice', exact: true }).click()
  await page.getByRole('button', { name: 'Create interview' }).click()
  await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}$/)

  // Push-to-talk (hands-free off): the fake microphone loops the recording, so it never goes silent.
  await page.getByRole('checkbox', { name: /Hands-free conversation/ }).uncheck()
  await page.getByRole('button', { name: 'Start interview' }).click()
  await expect(page.getByText(/AI interviewer · Question 1/)).toBeVisible({ timeout: 150_000 })

  await page.getByRole('button', { name: 'Start speaking' }).click()
  await expect(page.getByText(/Listening…/)).toBeVisible()
  await page.waitForTimeout(13_000) // let the recorded answer play once
  await page.getByRole('button', { name: 'Stop and transcribe' }).click()

  const answer = page.getByLabel(/Your answer/)
  await expect(answer).toHaveValue(/private subnet/i, { timeout: 60_000 })
  await expect(answer).toHaveValue(/security group/i)

  await page.getByRole('button', { name: 'Submit answer' }).click()
  await expect(page.getByText(/Answer score|Coding score|System Design score/)).toBeVisible({ timeout: 150_000 })

  // Clean up: end the interview.
  await page.getByRole('button', { name: 'End interview' }).click()
  await page.getByRole('button', { name: 'End and see report' }).click()
  await expect(page).toHaveURL(/\/results$/, { timeout: 150_000 })
})
