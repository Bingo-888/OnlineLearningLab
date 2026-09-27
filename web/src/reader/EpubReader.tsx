import { useEffect, useRef, useState } from 'react'
import ePub from 'epubjs'
import { Toc } from '../components/Toc'
import { getTheme, applyTheme, type Theme } from '../lib/theme'

interface Props {
  url: string
  initialLocator: string | null
  onProgress: (locator: string, percent: number) => void
}

export function EpubReader({ url, initialLocator, onProgress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renditionRef = useRef<any>(null)
  const locationsReadyRef = useRef(false)
  const onProgressRef = useRef(onProgress)
  onProgressRef.current = onProgress

  const [tocItems, setTocItems] = useState<{ label: string; href: string }[]>([])
  const [tocOpen, setTocOpen] = useState(false)
  const [fontScale, setFontScale] = useState(100)
  const [theme, setTheme] = useState<Theme>(getTheme())
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // 服务端文件路由无扩展名（/api/books/:id/file），epub.js 默认按扩展名判断类型会走「解压目录」分支，
    // 因此必须显式指定 openAs: 'epub'（按二进制 XHR 拉取后解压）。
    const book = ePub(url, { openAs: 'epub' })
    const rendition = book.renderTo(container, { width: '100%', height: '100%', flow: 'paginated' })
    renditionRef.current = rendition

    rendition.themes.register('light', { body: { background: '#ffffff', color: '#111827' } })
    rendition.themes.register('dark', { body: { background: '#111827', color: '#e5e7eb' } })
    rendition.themes.select(getTheme() === 'dark' ? 'dark' : 'light')

    rendition.on('relocated', (location: any) => {
      const cfi: string = location?.start?.cfi
      if (!cfi) return
      let pct = 0
      if (locationsReadyRef.current) {
        const raw = book.locations.percentageFromCfi(cfi)
        pct = raw == null ? 0 : Math.round(raw * 100)
      }
      setPercent(pct)
      onProgressRef.current(cfi, pct)
    })

    void book.loaded.navigation.then((nav: any) => {
      setTocItems((nav?.toc ?? []).map((item: any) => ({ label: String(item.label ?? '').trim() || '未命名章节', href: item.href })))
    })

    void book.ready
      .then(() => book.locations.generate(1600))
      .then(() => {
        locationsReadyRef.current = true
      })
      .catch(() => {
        // 位置表生成失败：进度将回退为 0%，阅读不受影响
      })

    void rendition.display(initialLocator ?? undefined)

    return () => {
      rendition.destroy()
      book.destroy()
      renditionRef.current = null
      locationsReadyRef.current = false
    }
  }, [url]) // initialLocator 只取首次值：由 ReaderPage 保证挂载时已拿到

  useEffect(() => {
    const size = Math.round(16 * (fontScale / 100))
    renditionRef.current?.themes.fontSize(`${size}px`)
  }, [fontScale])

  useEffect(() => {
    renditionRef.current?.themes.select(theme === 'dark' ? 'dark' : 'light')
    applyTheme(theme)
  }, [theme])

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
        <button data-testid="toc-button" onClick={() => setTocOpen((v) => !v)}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">目录</button>
        <button data-testid="epub-prev" onClick={() => void renditionRef.current?.prev()}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">上一页</button>
        <button data-testid="epub-next" onClick={() => void renditionRef.current?.next()}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">下一页</button>
        <span className="mx-2 text-gray-400">|</span>
        <button data-testid="font-decrease" onClick={() => setFontScale((v) => Math.max(70, v - 10))}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">A-</button>
        <button data-testid="font-increase" onClick={() => setFontScale((v) => Math.min(180, v + 10))}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">A+</button>
        <span className="mx-2 text-gray-400">|</span>
        <button data-testid="reader-theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700">
          {theme === 'dark' ? '浅色' : '深色'}
        </button>
        <span data-testid="progress-text" className="ml-auto text-gray-500">{percent}%</span>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1" />

      {tocOpen && (
        <Toc
          items={tocItems.map((item) => ({
            label: item.label,
            onSelect: () => {
              void renditionRef.current?.display(item.href)
              setTocOpen(false)
            },
          }))}
          onClose={() => setTocOpen(false)}
        />
      )}
    </div>
  )
}
