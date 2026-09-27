import { test, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeTestApp, registerUser, createLearner } from '../test-helpers.js'

const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n')

export function pdfFormData(name = 'book.pdf', bytes: Uint8Array = PDF, extra: Record<string, string | File> = {}) {
  const fd = new FormData()
  fd.set('file', new File([bytes], name, { type: 'application/pdf' }))
  for (const [k, v] of Object.entries(extra)) fd.set(k, v)
  return fd
}

test('管理员上传 PDF：201 + 文件落盘 + 元数据入库', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const fd = pdfFormData('深度学习入门.pdf', PDF, { title: '深度学习入门', author: '张三' })
  const res = await ctx.app.request('/api/books', { method: 'POST', body: fd, headers: admin.headers })
  expect(res.status).toBe(201)
  const { book } = (await res.json()) as { book: { id: string; title: string; author: string; format: string; sizeBytes: number; hasCover: boolean; progress: null } }
  expect(book.title).toBe('深度学习入门')
  expect(book.author).toBe('张三')
  expect(book.format).toBe('pdf')
  expect(book.sizeBytes).toBe(PDF.length)
  expect(book.hasCover).toBe(false)
  expect(book.progress).toBe(null)
  expect(existsSync(join(ctx.dataDir, 'books', `${book.id}.pdf`))).toBe(true)
})

test('未提供 title 时用文件名（去扩展名）兜底', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const res = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData('my notes.pdf'), headers: admin.headers })
  const { book } = (await res.json()) as { book: { title: string } }
  expect(book.title).toBe('my notes')
})

test('非管理员上传 → 403', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const learner = await createLearner(ctx, admin, 'alice')
  const res = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData(), headers: learner.headers })
  expect(res.status).toBe(403)
})

test('未登录上传 → 401', async () => {
  const ctx = makeTestApp()
  const res = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData() })
  expect(res.status).toBe(401)
})

test('缺少文件字段 → 400 missing_file', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const fd = new FormData()
  fd.set('title', '没有文件')
  const res = await ctx.app.request('/api/books', { method: 'POST', body: fd, headers: admin.headers })
  expect(res.status).toBe(400)
  expect(await res.json()).toEqual({ error: 'missing_file' })
})

test('超过大小上限 → 413 file_too_large（上限设为 1MB）', async () => {
  const ctx = makeTestApp({ maxUploadMb: 1 })
  const admin = await registerUser(ctx, 'boss')
  const big = new Uint8Array(1024 * 1024 + 1)
  big.set(PDF) // 仍然是合法 PDF 头，但超限
  const res = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('big.pdf', big),
    headers: admin.headers,
  })
  expect(res.status).toBe(413)
})

test('魔数不识别的文件 → 415 unsupported_format', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const fd = new FormData()
  fd.set('file', new File([new TextEncoder().encode('GIF89a...')], 'fake.pdf', { type: 'application/pdf' }))
  const res = await ctx.app.request('/api/books', { method: 'POST', body: fd, headers: admin.headers })
  expect(res.status).toBe(415)
  expect(await res.json()).toEqual({ error: 'unsupported_format' })
})

test('EPUB 上传（PK 魔数）→ 201 且落盘 .epub', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const epubBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00, 0x00])
  const fd = new FormData()
  fd.set('file', new File([epubBytes], 'novel.epub', { type: 'application/epub+zip' }))
  const res = await ctx.app.request('/api/books', { method: 'POST', body: fd, headers: admin.headers })
  expect(res.status).toBe(201)
  const { book } = (await res.json()) as { book: { id: string; format: string } }
  expect(book.format).toBe('epub')
  expect(existsSync(join(ctx.dataDir, 'books', `${book.id}.epub`))).toBe(true)
})

test('带 PNG 封面 → 201 + hasCover=true + 封面落盘', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const res = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('with-cover.pdf', PDF, { cover: new File([png], 'cover.png', { type: 'image/png' }) }),
    headers: admin.headers,
  })
  expect(res.status).toBe(201)
  const { book } = (await res.json()) as { book: { id: string; hasCover: boolean } }
  expect(book.hasCover).toBe(true)
  expect(existsSync(join(ctx.dataDir, 'covers', `${book.id}.png`))).toBe(true)
})

test('非法封面（伪造 content-type）→ 415 unsupported_cover', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const res = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('bad-cover.pdf', PDF, { cover: new File([new TextEncoder().encode('not an image')], 'c.png', { type: 'image/png' }) }),
    headers: admin.headers,
  })
  expect(res.status).toBe(415)
})
