import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174',
    channel: 'chrome',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    viewport: {
      width: 1280,
      height: 800
    }
  }
})
