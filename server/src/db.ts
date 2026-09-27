import { DatabaseSync } from 'node:sqlite'
import { SCHEMA_SQL } from './schema.js'

export type Db = DatabaseSync

/**
 * 打开数据库并保证 schema 已迁移。
 * ':memory:' 亦可（测试用）。node:sqlite 为同步 API。
 */
export function openDb(path: string): Db {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')
  migrate(db)
  return db
}

function migrate(db: Db) {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (row.user_version < 1) {
    db.exec(SCHEMA_SQL)
    db.exec('PRAGMA user_version = 1')
  }
}

/** 同步事务助手（node:sqlite 没有 db.transaction() 包装器） */
export function withTx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
