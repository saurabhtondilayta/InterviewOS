import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const isWin = process.platform === 'win32'
const root = path.resolve(import.meta.dirname, '..')
const python = path.join(root, 'backend', '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python')

export default defineConfig({
  testDir: './tests',
  // Steps share one logged-in browser and must run in order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 5 * 60_000, // AI steps can take a while on the free tier
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1400, height: 900 },
    headless: process.env.HEADLESS === '1',
    // Slow enough to follow each click with your eyes.
    launchOptions: { slowMo: Number(process.env.SLOW_MO ?? 250) },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    permissions: ['microphone'],
  },
  // Starts the app if it isn't already running (re-uses running servers).
  webServer: [
    {
      command: `"${python}" -m uvicorn app.main:app --port 8000`,
      cwd: path.join(root, 'backend'),
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      cwd: path.join(root, 'frontend'),
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
