import { test, expect } from 'vitest'
import { openDb } from './db.js'
import {
  hashPassword, verifyPassword, sha256,
  createSession, getSessionUser, deleteSession, deleteUserSessions, SESSION_TTL_MS,
  makeRateLimiter,
} from './auth.js'

function seedUser(db: ReturnType<typeof openDb>, id = 'u1') {
  db.prepare(`INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?,?,'','learner',1)`).run(id, `user_${id}`)
  return id
}

test('scrypt：同密码两次哈希不同盐，但都能验证通过', () => {
  const h1 = hashPassword('password123')
  const h2 = hashPassword('password123')
  expect(h1).not.toBe(h2)
  expect(h1.startsWith('scrypt$')).toBe(true)
  expect(verifyPassword('password123', h1)).toBe(true)
  expect(verifyPassword('password124', h1)).toBe(false)
})

test('verifyPassword 对损坏的哈希返回 false 而不抛错', () => {
  expect(verifyPassword('x', 'garbage')).toBe(false)
  expect(verifyPassword('x', 'scrypt$zz$zz')).toBe(false)
})

test('sha256 稳定输出', () => {
  expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('会话：创建/查询/删除/过期', () => {
  const db = openDb(':memory:')
  const uid = seedUser(db)
  const token = createSession(db, uid)
  expect(getSessionUser(db, token)?.id).toBe(uid)
  // 库里存的是哈希而不是明文 token
  expect(db.prepare('SELECT id FROM sessions').get()).toEqual({ id: sha256(token) })
  expect(getSessionUser(db, 'not-a-token')).toBe(null)
  deleteSession(db, token)
  expect(getSessionUser(db, token)).toBe(null)
})

test('会话过期后不可用', () => {
  const db = openDb(':memory:')
  const uid = seedUser(db)
  const token = 'deadbeef'.repeat(8)
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(sha256(token), uid, Date.now() - SESSION_TTL_MS - 1, Date.now() - 1)
  expect(getSessionUser(db, token)).toBe(null)
})

test('deleteUserSessions 清空该用户全部会话', () => {
  const db = openDb(':memory:')
  const uid = seedUser(db)
  const t1 = createSession(db, uid)
  const t2 = createSession(db, uid)
  deleteUserSessions(db, uid)
  expect(getSessionUser(db, t1)).toBe(null)
  expect(getSessionUser(db, t2)).toBe(null)
})

test('限流器：超过 limit 拒绝，窗口滑过后恢复', () => {
  let t = 1_000
  const allow = makeRateLimiter({ limit: 2, windowMs: 1_000, now: () => t })
  expect(allow('k')).toBe(true)
  expect(allow('k')).toBe(true)
  expect(allow('k')).toBe(false) // 第 3 次在窗口内 → 拒绝
  t = 2_100 // 窗口滑过
  expect(allow('k')).toBe(true)
  expect(allow('other')).toBe(true) // 不同 key 独立计数
})
