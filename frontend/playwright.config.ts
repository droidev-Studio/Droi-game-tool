import { defineConfig, devices } from '@playwright/test'

const landingDir = 'D:\\Claude code\\.claude\\games\\Droi-AI-landing-temp'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `node scripts/serve-static.mjs "${landingDir}" 5180`,
      url: 'http://127.0.0.1:5180',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
