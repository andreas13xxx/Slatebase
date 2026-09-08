import path from 'node:path'
import os from 'node:os'
import { defineConfig, devices } from '@playwright/test'

// Isolated per-run data directory so the smoke test always sees a fresh
// backend (default admin account, no leftover vaults) — never the repo's own
// backend/data. Not cleaned up automatically; safe to delete between local
// runs if you want the mustChangePassword prompt to reliably reappear.
const E2E_DATA_DIR = path.join(os.tmpdir(), 'slatebase-e2e-data')

export default defineConfig({
  testDir: './e2e',
  // manual/ holds demo-recording.spec.ts, which records a video against a
  // developer's own running instance and real credentials — not a test, and
  // not meant to run in CI.
  testIgnore: '**/manual/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Two servers: Vite's dev server (frontend) proxies /api to the backend on
  // port 3000 (see vite.config.ts), so both need to be up for anything beyond
  // the login page to work. reuseExistingServer is off in CI so the backend
  // always starts from the fresh E2E_DATA_DIR above rather than a leftover
  // one from a previous job.
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx tsx src/index.ts',
      cwd: '../backend',
      url: 'http://localhost:3000/healthz',
      reuseExistingServer: !process.env.CI,
      env: {
        SLATEBASE_PORT: '3000',
        SLATEBASE_HOST: '127.0.0.1',
        SLATEBASE_ALLOWED_ORIGINS: 'http://localhost:5173',
        SLATEBASE_DATA_DIR: E2E_DATA_DIR,
        SLATEBASE_CSRF_SECRET: 'e2e-test-csrf-secret-not-for-production-use-only',
      },
    },
  ],
})
