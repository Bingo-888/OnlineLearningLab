import { Hono } from 'hono'
import { deleteCookie, getCookie } from 'hono/cookie'
import { loginSchema, registerSchema } from '@oll/shared'
import type { AppOptions } from '../app.js'
import type { AppEnv, UserRow } from '../types.js'
import {
  createSession, deleteSession, getAuthUser, hashPassword, newId,
  setSessionCookie, toUserDto, verifyPassword,
} from '../auth.js'
import { withTx } from '../db.js'

export function authRoutes(opts: AppOptions, loginLimiter: (key: string) => boolean): Hono<AppEnv> {
  const { db } = opts
  const secure = opts.cookieSecure === true
  const r = new Hono<AppEnv>()

  r.post('/register', async (c) => {
    const parsed = registerSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_input' }, 400)
    const { username, password, inviteCode } = parsed.data

    const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
    const isFirst = n === 0
    // 用户名冲突优先于邀请码校验（409 先于 400），与测试用例约定一致
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
      return c.json({ error: 'username_taken' }, 409)
    }
    let inviteCodeToConsume: string | null = null
    if (!isFirst) {
      if (!inviteCode) return c.json({ error: 'invite_required' }, 400)
      const invite = db.prepare('SELECT code FROM invites WHERE code = ? AND used_by IS NULL').get(inviteCode)
      if (!invite) return c.json({ error: 'invalid_invite' }, 400)
      inviteCodeToConsume = inviteCode
    }

    const user: UserRow = {
      id: newId(),
      username,
      password_hash: hashPassword(password),
      role: isFirst ? 'admin' : 'learner',
      created_at: Date.now(),
    }
    withTx(db, () => {
      db.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?,?,?,?,?)')
        .run(user.id, user.username, user.password_hash, user.role, user.created_at)
      if (inviteCodeToConsume) {
        db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?')
          .run(user.id, Date.now(), inviteCodeToConsume)
      }
    })

    setSessionCookie(c, createSession(db, user.id), secure)
    return c.json({ user: toUserDto(user) }, 201)
  })

  r.post('/login', async (c) => {
    const parsed = loginSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_input' }, 400)
    const { username, password } = parsed.data
    if (!loginLimiter(`login:${username.toLowerCase()}`)) {
      return c.json({ error: 'too_many_attempts' }, 429)
    }
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined
    if (!row || !verifyPassword(password, row.password_hash)) {
      return c.json({ error: 'invalid_credentials' }, 401)
    }
    setSessionCookie(c, createSession(db, row.id), secure)
    return c.json({ user: toUserDto(row) })
  })

  r.post('/logout', (c) => {
    const token = getCookie(c, 'oll_session')
    if (token) deleteSession(db, token)
    deleteCookie(c, 'oll_session', { path: '/' })
    return c.body(null, 204)
  })

  r.get('/me', (c) => {
    const user = getAuthUser(db, c)
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    return c.json({ user: toUserDto(user) })
  })

  return r
}
