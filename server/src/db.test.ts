import { test, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, withTx } from './db.js'

function makeDb() {
  return openDb(join(mkdtempSync(join(tmpdir(), 'oll-db-')), 'db.sqlite'))
}

test('迁移后 user_version = 1 且五张表存在', () => {
  const db = makeDb()
  const v = db.prepare('PRAGMA user_version').get() as { user_version: number }
  expect(v.user_version).toBe(1)
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]
  const names = rows.map((r) => r.name)
  for (const t of ['books', 'invites', 'progress', 'sessions', 'users']) expect(names).toContain(t)
})

test('外键生效：插入孤儿 progress 会抛错', () => {
  const db = makeDb()
  expect(() =>
    db.prepare(`INSERT INTO progress (user_id, book_id, locator, percent, updated_at) VALUES ('x','y','l',0,0)`).run(),
  ).toThrow()
})

test('withTx 回滚', () => {
  const db = makeDb()
  expect(() =>
    withTx(db, () => {
      db.prepare(`INSERT INTO users (id, username, password_hash, role, created_at) VALUES ('u1','a','h','admin',1)`).run()
      throw new Error('boom')
    }),
  ).toThrow('boom')
  const n = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
  expect(n.n).toBe(0)
})

test('重复 openDb 幂等（不重复执行迁移）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oll-db-'))
  const db1 = openDb(join(dir, 'db.sqlite'))
  db1.close()
  const db2 = openDb(join(dir, 'db.sqlite'))
  expect((db2.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1)
})
