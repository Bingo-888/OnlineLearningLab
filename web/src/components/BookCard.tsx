import { Link } from 'react-router'
import type { BookDto } from '@oll/shared'

export function BookCard({ book }: { book: BookDto }) {
  return (
    <Link data-testid="book-card" to={`/book/${book.id}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-800">
        {book.hasCover ? (
          <img
            data-testid="cover-img"
            src={`/api/books/${book.id}/cover`}
            alt={book.title}
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl">{book.format === 'epub' ? '📖' : '📄'}</div>
        )}
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
          {book.format.toUpperCase()}
        </span>
      </div>
      <div className="mt-2 truncate font-medium" title={book.title}>{book.title}</div>
      <div className="truncate text-sm text-gray-500">{book.author ?? '未知作者'}</div>
      {book.progress ? (
        <div data-testid="progress-bar" className="mt-1 h-1.5 overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
          <div className="h-full bg-blue-500" style={{ width: `${book.progress.percent}%` }} />
        </div>
      ) : null}
    </Link>
  )
}
