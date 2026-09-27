import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import { resetPasswordSchema, type InviteDto } from '@oll/shared'
import type { AppOptions } from '../app.js'
import type { AppEnv, UserRow } from '../types.js'
import { deleteUserSessions, hashPassword, requireAdmin, toUserDto } from '../auth.js'
import { withTx } from '../db.js'

interface InviteRow {
  code: string
  created_by: string
  created_at: number
  used_by: string | null
  used_at: number | null
}

function toInviteDto(r: InviteRow): InviteDto {
  return { code: r.code, createdAt: r.created_at, usedBy: r.used_by, usedAt: r.used_at }
}

export function adminRoutes(opts: AppOptions): Hono<AppEnv> {
  const { db } = opts
  const r = new Hono<AppEnv>()

  r.get('/users', requireAdmin(db), (c) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as unknown as UserRow[]
    return c.json({ users: rows.map(toUserDto) })
  })

  r.post('/users/:id/password', requireAdmin(db), async (c) => {
    const parsed = resetPasswordSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_input' }, 400)
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(c.req.param('id'))
    if (!target) return c.json({ error: 'not_found' }, 404)
    withTx(db, () => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(hashPassword(parsed.data.newPassword), c.req.param('id'))
      deleteUserSessions(db, c.req.param('id'))
    })
    return c.body(null, 204)
  })

  r.get('/invites', requireAdmin(db), (c) => {
    const rows = db.prepare('SELECT * FROM invites ORDER BY created_at DESC').all() as unknown as InviteRow[]
    return c.json({ invites: rows.map(toInviteDto) })
  })

  r.post('/invites', requireAdmin(db), (c) => {
    const user = c.get('user') as UserRow
    const code = randomBytes(6).toString('hex')
    const createdAt = Date.now()
    db.prepare('INSERT INTO invites (code, created_by, created_at) VALUES (?,?,?)').run(code, user.id, createdAt)
    return c.json({ invite: { code, createdAt, usedBy: null, usedAt: null } }, 201)
  })

  return r
}
