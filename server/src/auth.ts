import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { Context, Next } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { Db } from './db.js'
import type { AppEnv, UserRow } from './types.js'
import type { UserDto } from '@oll/shared'

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const

export const SESSION_COOKIE = 'oll_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const key = scryptSync(password, salt, SCRYPT.keylen, SCRYPT)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[1], 'hex')
    const expected = Buffer.from(parts[2], 'hex')
    if (salt.length === 0 || expected.length === 0) return false
    const actual = scryptSync(password, salt, expected.length, SCRYPT)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function newId(): string {
  return randomUUID()
}

export function toUserDto(u: UserRow): UserDto {
  return { id: u.id, username: u.username, role: u.role, createdAt: u.created_at }
}

// ---- 会话 ----

export function createSession(db: Db, userId: string, now = Date.now()): string {
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(sha256(token), userId, now, now + SESSION_TTL_MS)
  return token
}

export function getSessionUser(db: Db, token: string, now = Date.now()): UserRow | null {
  if (!token) return null
  const row = db
    .prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.id = ? AND s.expires_at > ?`)
    .get(sha256(token), now) as UserRow | undefined
  return row ?? null
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token))
}

export function deleteUserSessions(db: Db, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

export function setSessionCookie(c: Context<AppEnv>, token: string, secure: boolean): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    secure,
  })
}

// ---- 请求上下文 ----

export function getAuthUser(db: Db, c: Context<AppEnv>): UserRow | null {
  const token = getCookie(c, SESSION_COOKIE)
  return token ? getSessionUser(db, token) : null
}

export function requireAuth(db: Db) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = getAuthUser(db, c)
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    c.set('user', user)
    await next()
  }
}

export function requireAdmin(db: Db) {
  return async (c: Context<AppEnv>, next: Next) => {
    const user = getAuthUser(db, c)
    if (!user) return c.json({ error: 'unauthorized' }, 401)
    if (user.role !== 'admin') return c.json({ error: 'forbidden' }, 403)
    c.set('user', user)
    await next()
  }
}

// ---- 登录限流（内存实现；重启即清零，可接受）----

export function makeRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }) {
  const { limit, windowMs } = opts
  const now = opts.now ?? (() => Date.now())
  const hits = new Map<string, number[]>()
  return (key: string): boolean => {
    const t = now()
    const arr = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
    if (arr.length >= limit) {
      hits.set(key, arr)
      return false
    }
    arr.push(t)
    hits.set(key, arr)
    return true
  }
}
