import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync, statSync, writeFileSync, createReadStream } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { progressSchema, type BookDto } from '@oll/shared'
import type { AppOptions } from '../app.js'
import type { AppEnv, UserRow } from '../types.js'
import { requireAdmin, requireAuth } from '../auth.js'
import { CONTENT_TYPES, ensureDataDirs, parseRange, sniffFormat, sniffImage } from '../files.js'

interface BookRow {
  id: string
  title: string
  author: string | null
  format: 'epub' | 'pdf'
  original_filename: string
  size_bytes: number
  storage_path: string
  cover_path: string | null
  owner_id: string
  visibility: string
  uploaded_at: number
}

type BookRowWithProgress = BookRow & { progress_locator: string | null; progress_percent: number | null }

export function toBookDto(r: BookRowWithProgress): BookDto {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    format: r.format,
    sizeBytes: r.size_bytes,
    hasCover: r.cover_path !== null,
    uploadedAt: r.uploaded_at,
    progress: r.progress_locator != null ? { locator: r.progress_locator, percent: r.progress_percent ?? 0 } : null,
  }
}

export function bookRoutes(opts: AppOptions): Hono<AppEnv> {
  const { db, dataDir } = opts
  const maxBytes = (opts.maxUploadMb ?? 200) * 1024 * 1024
  const r = new Hono<AppEnv>()

  r.post('/', requireAdmin(db), async (c) => {
    const body = await c.req.parseBody()
    const file = body['file']
    if (!(file instanceof File)) return c.json({ error: 'missing_file' }, 400)
    if (file.size > maxBytes) return c.json({ error: 'file_too_large' }, 413)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const format = sniffFormat(bytes)
    if (!format) return c.json({ error: 'unsupported_format' }, 415)

    let cover: { ext: string; bytes: Uint8Array } | null = null
    const coverField = body['cover']
    if (coverField instanceof File) {
      if (coverField.size > 5 * 1024 * 1024) return c.json({ error: 'cover_too_large' }, 413)
      const cb = new Uint8Array(await coverField.arrayBuffer())
      const ext = sniffImage(cb)
      if (!ext) return c.json({ error: 'unsupported_cover' }, 415)
      cover = { ext, bytes: cb }
    }

    const titleField = typeof body['title'] === 'string' ? body['title'].trim() : ''
    const authorField = typeof body['author'] === 'string' ? body['author'].trim() : ''
    const fallbackTitle = file.name.replace(/\.[^.]+$/, '') || '未命名书籍'
    const title = (titleField || fallbackTitle).slice(0, 300)
    const author = authorField ? authorField.slice(0, 200) : null

    const user = c.get('user') as UserRow
    const id = randomUUID()
    const storagePath = `books/${id}.${format}`
    ensureDataDirs(dataDir)
    writeFileSync(join(dataDir, storagePath), bytes)
    let coverRel: string | null = null
    if (cover) {
      coverRel = `covers/${id}.${cover.ext}`
      writeFileSync(join(dataDir, coverRel), cover.bytes)
    }

    const now = Date.now()
    db.prepare(`INSERT INTO books
      (id, title, author, format, original_filename, size_bytes, storage_path, cover_path, owner_id, visibility, uploaded_at)
      VALUES (?,?,?,?,?,?,?,?,?,'public',?)`)
      .run(id, title, author, format, file.name, file.size, storagePath, coverRel, user.id, now)

    const book: BookDto = {
      id, title, author, format, sizeBytes: file.size,
      hasCover: coverRel !== null, uploadedAt: now, progress: null,
    }
    return c.json({ book }, 201)
  })

  r.get('/', requireAuth(db), (c) => {
    const user = c.get('user') as UserRow
    const rows = db.prepare(`
      SELECT b.*, p.locator AS progress_locator, p.percent AS progress_percent
      FROM books b
      LEFT JOIN progress p ON p.book_id = b.id AND p.user_id = ?
      WHERE b.visibility = 'public'
      ORDER BY b.uploaded_at DESC, b.rowid DESC
    `).all(user.id) as unknown as BookRowWithProgress[]
    return c.json({ books: rows.map(toBookDto) })
  })

  r.get('/:id', requireAuth(db), (c) => {
    const user = c.get('user') as UserRow
    const id = c.req.param('id') ?? ''
    const row = db.prepare(`
      SELECT b.*, p.locator AS progress_locator, p.percent AS progress_percent
      FROM books b
      LEFT JOIN progress p ON p.book_id = b.id AND p.user_id = ?
      WHERE b.id = ?
    `).get(user.id, id) as unknown as BookRowWithProgress | undefined
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json({ book: toBookDto(row) })
  })

  r.get('/:id/file', requireAuth(db), (c) => {
    const row = db.prepare('SELECT * FROM books WHERE id = ?').get(c.req.param('id') ?? '') as BookRow | undefined
    if (!row) return c.json({ error: 'not_found' }, 404)
    const abs = join(dataDir, row.storage_path)
    if (!existsSync(abs)) return c.json({ error: 'not_found' }, 404)
    const size = statSync(abs).size
    const headers: Record<string, string> = {
      'content-type': CONTENT_TYPES[row.format],
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=0',
    }
    const range = parseRange(c.req.header('range') ?? null, size)
    if (range === 'invalid') {
      return c.body(null, 416, { 'content-range': `bytes */${size}` })
    }
    if (range) {
      const stream = createReadStream(abs, { start: range.start, end: range.end })
      return c.body(Readable.toWeb(stream) as ReadableStream, 206, {
        ...headers,
        'content-range': `bytes ${range.start}-${range.end}/${size}`,
        'content-length': String(range.end - range.start + 1),
      })
    }
    const stream = createReadStream(abs)
    return c.body(Readable.toWeb(stream) as ReadableStream, 200, {
      ...headers,
      'content-length': String(size),
    })
  })

  r.put('/:id/progress', requireAuth(db), async (c) => {
    const parsed = progressSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_input' }, 400)
    const id = c.req.param('id') ?? ''
    if (!db.prepare('SELECT id FROM books WHERE id = ?').get(id)) {
      return c.json({ error: 'not_found' }, 404)
    }
    const user = c.get('user') as UserRow
    db.prepare(`
      INSERT INTO progress (user_id, book_id, locator, percent, updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id, book_id) DO UPDATE SET
        locator = excluded.locator, percent = excluded.percent, updated_at = excluded.updated_at
    `).run(user.id, id, parsed.data.locator, parsed.data.percent, Date.now())
    return c.body(null, 204)
  })

  // T19 将在此文件继续追加：GET /:id/cover、DELETE /:id

  return r
}
