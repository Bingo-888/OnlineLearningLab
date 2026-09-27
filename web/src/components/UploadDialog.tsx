import { useRef, useState } from 'react'
import type { BookDto } from '@oll/shared'
import { api, ApiError } from '../api/client'
import { extractMeta } from '../reader/extract'

export function UploadDialog({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    try {
      setStatus('正在解析文件…')
      const meta = await extractMeta(file)
      setStatus('正在上传…')
      const form = new FormData()
      form.set('file', file)
      form.set('title', meta.title ?? file.name.replace(/\.[^.]+$/, ''))
      if (meta.author) form.set('author', meta.author)
      if (meta.cover) form.set('cover', meta.cover, 'cover.jpg')
      await api.postForm<{ book: BookDto }>('/api/books', form)
      setStatus('上传成功')
      onUploaded()
    } catch (err) {
      const map: Record<string, string> = {
        file_too_large: '文件超过大小上限',
        unsupported_format: '不支持的格式（仅 EPUB / PDF）',
        unsupported_cover: '封面格式不支持',
      }
      setError(err instanceof ApiError ? map[err.message] ?? `上传失败：${err.message}` : '上传失败，请重试')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        data-testid="upload-dialog"
        className="w-96 space-y-4 rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">上传书籍</h2>
        <p className="text-sm text-gray-500">支持 EPUB / PDF，默认上限 200MB。标题与封面将自动从文件中提取。</p>
        <input
          ref={inputRef}
          data-testid="upload-input"
          type="file"
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
          className="block w-full text-sm"
        />
        {status && <p data-testid="upload-status" className="text-sm text-blue-600">{status}</p>}
        {error && <p data-testid="upload-error" className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700">
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
