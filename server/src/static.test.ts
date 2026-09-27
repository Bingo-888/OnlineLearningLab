import { test, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from './app.js'
import { openDb } from './db.js'

function makeStaticApp() {
  const webRoot = mkdtempSync(join(tmpdir(), 'oll-static-'))
  writeFileSync(join(webRoot, 'index.html'), '<html><body>OLL-APP</body></html>')
  const dataDir = mkdtempSync(join(tmpdir(), 'oll-static-data-'))
  const db = openDb(':memory:')
  const app = createApp({ db, dataDir, cookieSecure: false, webRoot })
  return app
}

test('根路径返回 index.html', async () => {
  const res = await makeStaticApp().request('/')
  expect(res.status).toBe(200)
  expect(await res.text()).toContain('OLL-APP')
})

test('SPA 深层路由回退到 index.html', async () => {
  const res = await makeStaticApp().request('/book/abc123')
  expect(res.status).toBe(200)
  expect(await res.text()).toContain('OLL-APP')
})

test('未匹配的 /api/* 仍是 JSON 404，而不是 index.html', async () => {
  const res = await makeStaticApp().request('/api/unknown')
  expect(res.status).toBe(404)
  expect(await res.json()).toEqual({ error: 'not_found' })
})

test('未配置 webRoot 时（开发模式）非 API 路径返回 JSON 404', async () => {
  const db = openDb(':memory:')
  const app = createApp({ db, dataDir: mkdtempSync(join(tmpdir(), 'oll-dev-')), cookieSecure: false })
  const res = await app.request('/book/abc')
  expect(res.status).toBe(404)
})
