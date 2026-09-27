import ePub from 'epubjs'
import * as pdfjs from 'pdfjs-dist'

// 必须与 PdfReader 中的写法一致：单行 new URL（Vite ≥7.1 对多行写法有已知回归）
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export interface ExtractedMeta {
  title: string | null
  author: string | null
  cover: Blob | null
}

export async function extractMeta(file: File): Promise<ExtractedMeta> {
  const bytes = await file.arrayBuffer()
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.epub')) return extractEpub(bytes)
  return extractPdf(bytes)
}

async function extractPdf(bytes: ArrayBuffer): Promise<ExtractedMeta> {
  const task = pdfjs.getDocument({ data: bytes })
  const doc = await task.promise
  try {
    const meta = await doc.getMetadata().catch(() => null)
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string }
    const cover = await renderFirstPage(doc)
    return {
      title: info.Title?.trim() || null,
      author: info.Author?.trim() || null,
      cover,
    }
  } finally {
    // pdfjs-dist v6：destroy() 在 loading task 上（PDFDocumentProxy 的已移除）
    void task.destroy()
  }
}

async function renderFirstPage(doc: pdfjs.PDFDocumentProxy): Promise<Blob | null> {
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 400 / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    await page.render({ canvasContext: ctx, viewport } as never).promise
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  } catch {
    return null
  }
}

async function extractEpub(bytes: ArrayBuffer): Promise<ExtractedMeta> {
  const book = ePub(bytes)
  try {
    await book.ready
    const meta = (await book.loaded.metadata) as { title?: string; creator?: string } | undefined
    let cover: Blob | null = null
    try {
      const coverUrl = await book.coverUrl()
      if (coverUrl) cover = await (await fetch(coverUrl)).blob()
    } catch {
      // 无封面不致命
    }
    return {
      title: meta?.title?.trim() || null,
      author: meta?.creator?.trim() || null,
      cover,
    }
  } finally {
    book.destroy()
  }
}
