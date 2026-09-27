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
