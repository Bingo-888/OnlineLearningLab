import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { BookDto } from '@oll/shared'
import { api } from '../api/client'
import { useMe } from '../auth/RequireAuth'
import { BookCard } from '../components/BookCard'
import { UploadDialog } from '../components/UploadDialog'
import { applyTheme, getTheme } from '../lib/theme'

export function LibraryPage() {
  const me = useMe()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [uploadOpen, setUploadOpen] = useState(false)
  const theme = getTheme()

  const books = useQuery({
    queryKey: ['books'],
    queryFn: async () => (await api.get<{ books: BookDto[] }>('/api/books')).books,
  })

  async function onLogout() {
    await api.post('/api/auth/logout')
    qc.clear()
    navigate('/login')
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark')
    navigate(0) // 简单粗暴地重挂载以刷新主题渲染；当前可接受
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">书架</h1>
        <div className="flex items-center gap-3 text-sm">
          {me.data?.role === 'admin' && (
            <>
              <button data-testid="upload-button" onClick={() => setUploadOpen(true)}
                className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700">
                上传书籍
              </button>
              <button data-testid="admin-link" onClick={() => navigate('/admin')}
                className="rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700">
                管理
              </button>
            </>
          )}
          <button data-testid="theme-toggle" onClick={toggleTheme}
            className="rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700">
            {theme === 'dark' ? '浅色' : '深色'}
          </button>
          <span className="text-gray-500">{me.data?.username}</span>
          <button data-testid="logout-button" onClick={onLogout}
            className="rounded border border-gray-300 px-3 py-1.5 dark:border-gray-700">
            退出
          </button>
        </div>
      </header>

      {books.isPending && <p className="text-gray-400">加载中…</p>}
      {books.isError && <p className="text-red-500">书架加载失败，请刷新重试</p>}
      {books.data?.length === 0 && (
        <p data-testid="empty-state" className="py-24 text-center text-gray-400">
          书架还是空的{me.data?.role === 'admin' ? '，点右上角「上传书籍」添加第一本吧' : ''}
        </p>
      )}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {books.data?.map((b) => <BookCard key={b.id} book={b} />)}
      </div>

      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            void qc.invalidateQueries({ queryKey: ['books'] })
            setUploadOpen(false)
          }}
        />
      )}
    </div>
  )
}
