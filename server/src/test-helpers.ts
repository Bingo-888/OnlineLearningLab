import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Hono } from 'hono'
import { createApp, type AppEnv } from './app.js'

export interface TestCtx {
  app: Hono<AppEnv>
  db: DatabaseSync
  dataDir: string
}

export function makeTestApp(opts: { maxUploadMb?: number } = {}): TestCtx {
  const dataDir = mkdtempSync(join(tmpdir(), 'oll-test-'))
  const db = new DatabaseSync(':memory:')
  const app = createApp({ db, dataDir, cookieSecure: false, maxUploadMb: opts.maxUploadMb ?? 200 })
  return { app, db, dataDir }
}

/** 注册用户并返回携带会话 Cookie 的请求头 */
export async function registerUser(
  ctx: TestCtx,
  username: string,
  password = 'password123',
  inviteCode?: string,
): Promise<{ headers: { cookie: string }; user: { id: string; role: string } }> {
  const res = await ctx.app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, inviteCode }),
  })
  const setCookie = res.headers.get('set-cookie') ?? ''
  const token = /oll_session=([^;]+)/.exec(setCookie)?.[1]
  if (!token) throw new Error(`register failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { user: { id: string; role: string } }
  return { headers: { cookie: `oll_session=${token}` }, user: body.user }
}
