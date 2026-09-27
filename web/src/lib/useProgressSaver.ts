import { useEffect, useMemo, useRef } from 'react'
import { debounce } from './debounce'
import { api } from '../api/client'

/**
 * 阅读进度保存：事件触发后 2 秒防抖落库；
 * 组件卸载（切页/关标签）时用最后一次位置补一次保存。
 */
export function useProgressSaver(bookId: string) {
  const lastRef = useRef<{ locator: string; percent: number } | null>(null)

  const save = useMemo(
    () =>
      debounce((locator: string, percent: number) => {
        void api.put(`/api/books/${bookId}/progress`, { locator, percent }).catch(() => {
          // 静默失败：阅读体验优先，下次事件会重试
        })
      }, 2000),
    [bookId],
  )

  useEffect(() => {
    return () => {
      if (lastRef.current) {
        void api.put(`/api/books/${bookId}/progress`, lastRef.current).catch(() => {})
      }
    }
  }, [bookId])

  return (locator: string, percent: number) => {
    lastRef.current = { locator, percent }
    save(locator, percent)
  }
}
