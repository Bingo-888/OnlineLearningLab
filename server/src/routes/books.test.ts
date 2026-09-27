import { test, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { makeTestApp, registerUser } from '../test-helpers.js'

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
