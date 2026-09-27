import { test, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeTestApp, registerUser, createLearner } from '../test-helpers.js'

const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n')

export function pdfFormData(name = 'book.pdf', bytes: Uint8Array<ArrayBuffer> = PDF, extra: Record<string, string | File> = {}) {
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

const uploadPdf = (ctx: ReturnType<typeof makeTestApp>, headers: { cookie: string }, title?: string) =>
  ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('a.pdf', PDF, title ? { title } : {}),
    headers,
  })

test('登录用户看列表：按上传时间倒序，含自己的进度', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  await uploadPdf(ctx, admin.headers, '第一本')
  await uploadPdf(ctx, admin.headers, '第二本')
  const res = await ctx.app.request('/api/books', { headers: admin.headers })
  expect(res.status).toBe(200)
  const { books } = (await res.json()) as { books: { title: string; progress: unknown }[] }
  expect(books.map((b) => b.title)).toEqual(['第二本', '第一本'])
  expect(books[0].progress).toBe(null)
})

test('未登录看列表 → 401', async () => {
  const ctx = makeTestApp()
  const res = await ctx.app.request('/api/books')
  expect(res.status).toBe(401)
})

test('详情：存在 200；不存在 404', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await uploadPdf(ctx, admin.headers)
  const { book } = (await up.json()) as { book: { id: string } }
  const ok = await ctx.app.request(`/api/books/${book.id}`, { headers: admin.headers })
  expect(ok.status).toBe(200)
  const missing = await ctx.app.request('/api/books/no-such-id', { headers: admin.headers })
  expect(missing.status).toBe(404)
})

const RANGE_CONTENT = new TextEncoder().encode('%PDF-1.4 abcdefghijklmnopqrstuvwxyz 0123456789')

test('文件流：无 Range → 200 全量 + content-type', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('r.pdf', RANGE_CONTENT),
    headers: admin.headers,
  })
  const { book } = (await up.json()) as { book: { id: string } }
  const res = await ctx.app.request(`/api/books/${book.id}/file`, { headers: admin.headers })
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('application/pdf')
  expect(res.headers.get('accept-ranges')).toBe('bytes')
  expect((await res.arrayBuffer()).byteLength).toBe(RANGE_CONTENT.length)
})

test('文件流：Range 206 返回正确切片与 content-range', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('r.pdf', RANGE_CONTENT),
    headers: admin.headers,
  })
  const { book } = (await up.json()) as { book: { id: string } }
  const res = await ctx.app.request(`/api/books/${book.id}/file`, {
    headers: { ...admin.headers, range: 'bytes=0-3' },
  })
  expect(res.status).toBe(206)
  expect(res.headers.get('content-range')).toBe(`bytes 0-3/${RANGE_CONTENT.length}`)
  expect(await res.text()).toBe('%PDF')
})

test('文件流：非法 Range → 416', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await ctx.app.request('/api/books', {
    method: 'POST',
    body: pdfFormData('r.pdf', RANGE_CONTENT),
    headers: admin.headers,
  })
  const { book } = (await up.json()) as { book: { id: string } }
  const res = await ctx.app.request(`/api/books/${book.id}/file`, {
    headers: { ...admin.headers, range: 'bytes=99999-100000' },
  })
  expect(res.status).toBe(416)
})

test('文件流：未登录 401；不存在 404', async () => {
  const ctx = makeTestApp()
  expect((await ctx.app.request('/api/books/x/file')).status).toBe(401)
  const admin = await registerUser(ctx, 'boss')
  expect((await ctx.app.request('/api/books/x/file', { headers: admin.headers })).status).toBe(404)
})

test('进度：PUT 后列表与详情都带进度；重复 PUT 覆盖', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData('p.pdf'), headers: admin.headers })
  const { book } = (await up.json()) as { book: { id: string } }
  const put = await ctx.app.request(`/api/books/${book.id}/progress`, {
    method: 'PUT',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ locator: '3', percent: 60 }),
  })
  expect(put.status).toBe(204)
  const detail = await ctx.app.request(`/api/books/${book.id}`, { headers: admin.headers })
  const detailBody = (await detail.json()) as { book: { progress: { locator: string; percent: number } } }
  expect(detailBody.book.progress).toEqual({ locator: '3', percent: 60 })
  await ctx.app.request(`/api/books/${book.id}/progress`, {
    method: 'PUT',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ locator: '9', percent: 100 }),
  })
  const list = await ctx.app.request('/api/books', { headers: admin.headers })
  const listBody = (await list.json()) as { books: { progress: { locator: string } }[] }
  expect(listBody.books[0].progress.locator).toBe('9')
})

test('进度：跨用户隔离', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const learner = await createLearner(ctx, admin, 'alice')
  const up = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData('p.pdf'), headers: admin.headers })
  const { book } = (await up.json()) as { book: { id: string } }
  await ctx.app.request(`/api/books/${book.id}/progress`, {
    method: 'PUT',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ locator: '2', percent: 20 }),
  })
  const learnerList = await ctx.app.request('/api/books', { headers: learner.headers })
  const body = (await learnerList.json()) as { books: { progress: unknown }[] }
  expect(body.books[0].progress).toBe(null)
})

test('进度：非法输入 400；不存在的书 404', async () => {
  const ctx = makeTestApp()
  const admin = await registerUser(ctx, 'boss')
  const up = await ctx.app.request('/api/books', { method: 'POST', body: pdfFormData('p.pdf'), headers: admin.headers })
  const { book } = (await up.json()) as { book: { id: string } }
  const bad = await ctx.app.request(`/api/books/${book.id}/progress`, {
    method: 'PUT',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ locator: '', percent: 150 }),
  })
  expect(bad.status).toBe(400)
  const missing = await ctx.app.request('/api/books/ghost/progress', {
    method: 'PUT',
    headers: { ...admin.headers, 'content-type': 'application/json' },
    body: JSON.stringify({ locator: '1', percent: 1 }),
  })
  expect(missing.status).toBe(404)
})
