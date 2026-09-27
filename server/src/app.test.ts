import { test, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'

export function makeTestApp(opts: { maxUploadMb?: number } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'oll-test-'))
  const db = new DatabaseSync(':memory:')
  const app = createApp({ db, dataDir, cookieSecure: false, maxUploadMb: opts.maxUploadMb ?? 200 })
  return { app, db, dataDir }
}

test('GET /api/health 返回 ok', async () => {
  const { app } = makeTestApp()
  const res = await app.request('/api/health')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true })
})
