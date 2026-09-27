// 清空 E2E 数据目录（e2e/.data）。
//
// 为什么不是放在 e2e/global-setup.ts 里：Playwright 先启动 webServer（server 进程会打开并
// 持有 e2e/.data/db.sqlite），之后才跑 globalSetup —— 此时 rmSync 数据目录在 Windows 上必然
// EPERM。因此由 server 的启动命令在拉起 server 之前先执行本脚本（见 playwright.config.ts）。
import { mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dataDir = fileURLToPath(new URL('../e2e/.data', import.meta.url))

rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
mkdirSync(dataDir, { recursive: true })

console.log(`[e2e] data dir reset: ${dataDir}`)
