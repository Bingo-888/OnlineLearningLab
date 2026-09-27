import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Hono } from 'hono'
import { createApp, type AppEnv } from './app.js'
import { openDb, type Db } from './db.js'

export interface TestCtx {
  app: Hono<AppEnv>
  db: Db
  dataDir: string
}

export function makeTestApp(opts: { maxUploadMb?: number } = {}): TestCtx {
  const dataDir = mkdtempSync(join(tmpdir(), 'oll-test-'))
  const db = openDb(':memory:')
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

/** 管理员生成邀请码后注册学员（依赖 /api/admin/invites，见 T17） */
export async function createLearner(ctx: TestCtx, admin: { headers: { cookie: string } }, username: string) {
  const inv = await ctx.app.request('/api/admin/invites', { method: 'POST', headers: admin.headers })
  const code = ((await inv.json()) as { invite: { code: string } }).invite.code
  return registerUser(ctx, username, 'password123', code)
}
