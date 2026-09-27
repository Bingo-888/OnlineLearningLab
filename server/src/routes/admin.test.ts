import { test, expect } from 'vitest'
import { makeTestApp, registerUser, createLearner } from '../test-helpers.js'

test('管理员生成邀请码 → 201；列表可见且未使用', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const res = await ctx.app.request('/api/admin/invites', { method: 'POST', headers: admin.headers })
  expect(res.status).toBe(201)
  const { invite } = (await res.json()) as { invite: { code: string; usedBy: null } }
  expect(invite.code).toMatch(/^[0-9a-f]{12}$/)
  expect(invite.usedBy).toBe(null)
  const list = await ctx.app.request('/api/admin/invites', { headers: admin.headers })
  const body = (await list.json()) as { invites: { code: string }[] }
  expect(body.invites.map((i) => i.code)).toContain(invite.code)
})

test('学员访问管理接口 → 403；匿名 → 401', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const learner = await createLearner(ctx, admin, 'alice')
  expect((await ctx.app.request('/api/admin/invites', { headers: learner.headers })).status).toBe(403)
  expect((await ctx.app.request('/api/admin/invites')).status).toBe(401)
  expect((await ctx.app.request('/api/admin/users', { headers: learner.headers })).status).toBe(403)
})

test('用户列表包含 admin 与 learner', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  await createLearner(ctx, admin, 'alice')
  const res = await ctx.app.request('/api/admin/users', { headers: admin.headers })
  const { users } = (await res.json()) as { users: { username: string; role: string }[] }
  expect(users.map((u) => `${u.username}:${u.role}`)).toEqual(['boss:admin', 'alice:learner'])
})

test('管理员重置密码：旧密码失效、新密码可登录、旧会话被吊销', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const learner = await createLearner(ctx, admin, 'alice')
  const reset = await ctx.app.request(`/api/admin/users/${learner.user.id}/password`, {
    method: 'POST',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ newPassword: 'brand-new-pass' }),
  })
  expect(reset.status).toBe(204)
  // 旧会话失效
  expect((await ctx.app.request('/api/auth/me', { headers: learner.headers })).status).toBe(401)
  // 旧密码不能登录
  const oldLogin = await ctx.app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'password123' }),
  })
  expect(oldLogin.status).toBe(401)
  // 新密码可以
  const newLogin = await ctx.app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'brand-new-pass' }),
  })
  expect(newLogin.status).toBe(200)
})

test('重置不存在的用户 → 404', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const res = await ctx.app.request('/api/admin/users/nope/password', {
    method: 'POST',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ newPassword: 'whatever-123' }),
  })
  expect(res.status).toBe(404)
})
