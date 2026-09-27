import { test, expect } from 'vitest'
import { makeTestApp } from '../test-helpers.js'

function json(body: unknown) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

test('第一个用户注册成功且是 admin，无需邀请码', async () => {
  const { app } = makeTestApp()
  const res = await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  expect(res.status).toBe(201)
  const body = (await res.json()) as { user: { role: string; username: string } }
  expect(body.user.role).toBe('admin')
  expect(body.user.username).toBe('boss')
  expect(res.headers.get('set-cookie')).toContain('oll_session=')
})

test('第二个用户缺邀请码 → 400 invite_required', async () => {
  const { app } = makeTestApp()
  await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const res = await app.request('/api/auth/register', json({ username: 'alice', password: 'password123' }))
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'invite_required' })
})

test('无效邀请码 → 400 invalid_invite', async () => {
  const { app, db } = makeTestApp()
  const reg = await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const bossId = ((await reg.json()) as { user: { id: string } }).user.id
  db.prepare(`INSERT INTO invites (code, created_by, created_at) VALUES ('good',?,1)`).run(bossId)
  const res = await app.request('/api/auth/register', json({ username: 'alice', password: 'password123', inviteCode: 'badcode' }))
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'invalid_invite' })
})

test('有效邀请码 → 201 learner，且邀请码被消费（不可复用）', async () => {
  const { app, db } = makeTestApp()
  const reg = await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const bossId = ((await reg.json()) as { user: { id: string } }).user.id
  db.prepare(`INSERT INTO invites (code, created_by, created_at) VALUES ('good',?,1)`).run(bossId)
  const res = await app.request('/api/auth/register', json({ username: 'alice', password: 'password123', inviteCode: 'good' }))
  expect(res.status).toBe(201)
  expect(((await res.json()) as { user: { role: string } }).user.role).toBe('learner')
  const again = await app.request('/api/auth/register', json({ username: 'bob', password: 'password123', inviteCode: 'good' }))
  expect(again.status).toBe(400)
  expect(await again.json()).toEqual({ error: 'invalid_invite' })
})

test('重复用户名（含大小写变体）→ 409 username_taken', async () => {
  const { app } = makeTestApp()
  await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const res = await app.request('/api/auth/register', json({ username: 'BOSS', password: 'password123' }))
  expect(res.status).toBe(409)
})

test('非法输入（短密码/坏用户名）→ 400 invalid_input', async () => {
  const { app } = makeTestApp()
  const shortPw = await app.request('/api/auth/register', json({ username: 'okname', password: 'short' }))
  expect(shortPw.status).toBe(400)
  expect(await shortPw.json()).toEqual({ error: 'invalid_input' })
  const badName = await app.request('/api/auth/register', json({ username: '带空格 名字', password: 'password123' }))
  expect(badName.status).toBe(400)
})

test('登录：正确凭证 200 + Cookie；错误 401；未知用户 401', async () => {
  const { app } = makeTestApp()
  await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const ok = await app.request('/api/auth/login', json({ username: 'boss', password: 'password123' }))
  expect(ok.status).toBe(200)
  expect(ok.headers.get('set-cookie')).toContain('oll_session=')
  const bad = await app.request('/api/auth/login', json({ username: 'boss', password: 'wrong-pass' }))
  expect(bad.status).toBe(401)
  expect(await bad.json()).toEqual({ error: 'invalid_credentials' })
  const ghost = await app.request('/api/auth/login', json({ username: 'nobody', password: 'password123' }))
  expect(ghost.status).toBe(401)
})

test('连续 10 次失败后第 11 次 → 429 too_many_attempts', async () => {
  const { app } = makeTestApp()
  await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  for (let i = 0; i < 10; i++) {
    const res = await app.request('/api/auth/login', json({ username: 'boss', password: 'nope-nope' }))
    expect(res.status).toBe(401)
  }
  const limited = await app.request('/api/auth/login', json({ username: 'boss', password: 'password123' }))
  expect(limited.status).toBe(429)
  expect(await limited.json()).toEqual({ error: 'too_many_attempts' })
})

test('me：带 Cookie 200；无 Cookie 401', async () => {
  const { app } = makeTestApp()
  const reg = await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const cookie = /oll_session=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')?.[1]
  const me = await app.request('/api/auth/me', { headers: { cookie: `oll_session=${cookie}` } })
  expect(me.status).toBe(200)
  expect(((await me.json()) as { user: { username: string } }).user.username).toBe('boss')
  const anon = await app.request('/api/auth/me')
  expect(anon.status).toBe(401)
})

test('logout：204 且会话立即失效', async () => {
  const { app } = makeTestApp()
  const reg = await app.request('/api/auth/register', json({ username: 'boss', password: 'password123' }))
  const cookie = `oll_session=${/oll_session=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')?.[1]}`
  const out = await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } })
  expect(out.status).toBe(204)
  const me = await app.request('/api/auth/me', { headers: { cookie } })
  expect(me.status).toBe(401)
})
