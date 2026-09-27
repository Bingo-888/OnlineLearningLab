import path from 'node:path'
import { defineConfig } from '@playwright/test'

const e2eDataDir = path.resolve('e2e/.data')

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:5173' },
  webServer: [
    {
      command: 'pnpm --filter @oll/server dev',
      port: 8787,
      reuseExistingServer: !process.env.CI,
      env: { PORT: '8787', DATA_DIR: e2eDataDir, COOKIE_SECURE: 'false' },
    },
    {
      command: 'pnpm --filter @oll/web dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
