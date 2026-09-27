import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Toc } from '../components/Toc'
import { applyTheme, getTheme, type Theme } from '../lib/theme'

// ⚠️ 必须与 <Document> 在同一模块内配置 worker（react-pdf 会在自身模块加载时写入默认值）；
// ⚠️ new URL(...) 必须写成单行（Vite ≥ 7.1 对多行写法有已知回归）。
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

interface Props {
  url: string
  initialLocator: string | null
  onProgress: (locator: string, percent: number) => void
}

export function PdfReader({ url, initialLocator, onProgress }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  const initialPage = initialLocator ? Math.max(1, Number.parseInt(initialLocator, 10) || 1) : 1
  const [page, setPage] = useState(initialPage)
  const [numPages, setNumPages] = useState(0)
  const [baseWidth, setBaseWidth] = useState(720)
  const [zoom, setZoom] = useState(1)
  const [tocItems, setTocItems] = useState<{ label: string; page: number }[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function measure() {
      const w = wrapRef.current?.clientWidth ?? window.innerWidth
      setBaseWidth(Math.max(240, Math.min(900, w - 32)))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (numPages > 0) onProgressRef.current(String(page), Math.round((page / numPages) * 100))
  }, [page, numPages])

  // 主题切换对「整页图片」不适用（有意不做 canvas 反色）；此处只作用于外围 UI 与工具栏
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const goTo = useCallback(
    (p: number) => {
      setPage(() => {
        const max = numPages || 1
        return p < 1 ? 1 : p > max ? max : p
      })
    },
    [numPages],
  )

  async function onLoadSuccess(pdf: PDFDocumentProxy) {
    setNumPages(pdf.numPages)
    setTocItems(await loadOutline(pdf))
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
        <button data-testid="toc-button" onClick={() => setTocOpen((v) => !v)} disabled={tocItems.length === 0}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 dark:border-gray-700">目录</button>
        <button data-testid="page-prev" onClick={() => goTo(page - 1)} disabled={page <= 1}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 dark:border-gray-700">上一页</button>
        <span className="flex items-center gap-1">
          <input
            data-testid="page-input"
            type="number"
            min={1}
            max={numPages || 1}
            value={page}
            onChange={(e) => goTo(Number.parseInt(e.target.value, 10) || 1)}
            className="w-16 rounded border border-gray-300 px-2 py-1 text-center dark:border-gray-700 dark:bg-gray-950"
          />
          <span className="text-gray-500">/ {numPages || '…'}</span>
        </span>
        <button data-testid="page-next" onClick={() => goTo(page + 1)} disabled={numPages > 0 && page >= numPages}
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 dark:border-gray-700">下一页</button>
        <span className="mx-2 text-gray-400">|</span>
        <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">缩小</button>
        <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">放大</button>
        <span className="mx-2 text-gray-400">|</span>
        <button data-testid="reader-theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">
          {theme === 'dark' ? '浅色' : '深色'}
        </button>
        <span data-testid="progress-text" className="ml-auto text-gray-500">
          {numPages > 0 ? Math.round((page / numPages) * 100) : 0}%
        </span>
      </div>

      <div ref={wrapRef} data-testid="pdf-viewer" className="min-h-0 flex-1 overflow-auto bg-gray-200 p-4 dark:bg-gray-900">
        {error && <p className="p-4 text-red-500">{error}</p>}
        <Document
          file={url}
          onLoadSuccess={(pdf) => void onLoadSuccess(pdf)}
          onLoadError={() => setError('PDF 加载失败')}
          loading={<p className="text-gray-500">PDF 加载中…</p>}
          className="flex justify-center"
        >
          <Page pageNumber={page} width={Math.round(baseWidth * zoom)} className="shadow-lg" />
        </Document>
      </div>

      {tocOpen && (
        <Toc
          items={tocItems.map((item) => ({
            label: item.label,
            onSelect: () => {
              goTo(item.page)
              setTocOpen(false)
            },
          }))}
          onClose={() => setTocOpen(false)}
        />
      )}
    </div>
  )
}

async function loadOutline(pdf: PDFDocumentProxy): Promise<{ label: string; page: number }[]> {
  const outline = await pdf.getOutline().catch(() => null)
  if (!outline) return []
  const items: { label: string; page: number }[] = []
  for (const entry of outline) {
    try {
      const dest = typeof entry.dest === 'string' ? await pdf.getDestination(entry.dest) : entry.dest
      if (!dest || !Array.isArray(dest) || dest.length === 0) continue
      const index = await pdf.getPageIndex(dest[0] as never)
      items.push({ label: String(entry.title ?? '').trim() || '未命名章节', page: index + 1 })
    } catch {
      // 个别目的式解析失败不影响其余目录项
    }
  }
  return items
}
