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
      // 注意：这里不用 `pnpm --filter @oll/server dev`（tsx watch）。Playwright 的 webServer
      // 以管道 stdio 启动子进程且不关闭 stdin，而 Windows 上 `tsx watch` 的被监管子进程会
      // 一直阻塞到 stdin EOF 才真正运行脚本 → webServer 超时。E2E 场景不需要文件监听，
      // 用 tsx 直接跑入口即可（本地手工开发仍用 `pnpm dev`，有 TTY 不受影响）。
      // 前置 `node scripts/reset-e2e-data.mjs`：Playwright 先起 webServer 再跑 globalSetup，
      // 数据目录只能在 server 打开 db 之前清空（见 e2e/global-setup.ts 注释）。
      command: 'node scripts/reset-e2e-data.mjs && pnpm --filter @oll/server exec tsx src/index.ts',
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
