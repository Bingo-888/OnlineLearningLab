import { test, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'

export function makeTestApp(opts: { maxUploadMb?: number } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'oll-test-'))
  const db = new DatabaseSync(':memory:')
  const app = createApp({ db, dataDir, cookieSecure: false, maxUploadMb: opts.maxUploadMb ?? 200 })
  return { app, db, dataDir }
}

test('GET /api/health 返回 ok 与版本号', async () => {
  // 版本号期望值直接读 server/package.json：health 的 version 必须等于服务端包版本（防硬编码漂移）
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  const { app } = makeTestApp()
  const res = await app.request('/api/health')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, version: pkg.version })
})
