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

  // T14~T18 将在此文件继续追加：GET /、GET /:id、GET /:id/file、GET /:id/cover、DELETE /:id、PUT /:id/progress

  return r
}
