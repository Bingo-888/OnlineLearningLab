import { mkdirSync } from 'node:fs'
import path from 'node:path'

export default function globalSetup() {
  // 注意：Playwright 的 webServer 先于 globalSetup 启动，server 进程此时已持有
  // e2e/.data/db.sqlite 的 Windows 文件句柄，在此处 rmSync 数据目录会 EPERM。
  // 因此“每轮清空数据”改由 server 的 webServer 命令在启动前置执行
  // （scripts/reset-e2e-data.mjs，见 playwright.config.ts）。这里只兜底确保目录存在。
  const dir = path.resolve('e2e/.data')
  mkdirSync(dir, { recursive: true })
}
