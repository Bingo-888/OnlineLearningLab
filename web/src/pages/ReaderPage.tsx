import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { BookDto } from '@oll/shared'
import { api } from '../api/client'
import { useProgressSaver } from '../lib/useProgressSaver'
import { EpubReader } from '../reader/EpubReader'
import { PdfReader } from '../reader/PdfReader'

export function ReaderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const saveProgress = useProgressSaver(id ?? '')

  const book = useQuery({
    queryKey: ['book', id],
    queryFn: async () => (await api.get<{ book: BookDto }>(`/api/books/${id}`)).book,
    enabled: Boolean(id),
  })

  if (book.isPending) return <div className="p-8 text-center text-gray-400">加载中…</div>
  if (book.isError || !book.data) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">书籍不存在或已被删除</p>
        <button onClick={() => navigate('/library')} className="mt-4 rounded bg-blue-600 px-4 py-2 text-white">返回书架</button>
      </div>
    )
  }

  const b = book.data
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-2 dark:border-gray-800">
        <button data-testid="back-to-library" onClick={() => navigate('/library')}
          className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700">← 书架</button>
        <h1 data-testid="reader-title" className="truncate font-medium">{b.title}</h1>
        <span className="ml-auto text-sm text-gray-400">{b.author ?? ''}</span>
      </div>
      <div className="min-h-0 flex-1">
        {b.format === 'epub' ? (
          <EpubReader url={`/api/books/${b.id}/file`} initialLocator={b.progress?.locator ?? null} onProgress={saveProgress} />
        ) : (
          <PdfReader url={`/api/books/${b.id}/file`} initialLocator={b.progress?.locator ?? null} onProgress={saveProgress} />
        )}
      </div>
    </div>
  )
}
