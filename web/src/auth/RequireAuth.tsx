import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router'
import type { ReactNode } from 'react'
import type { UserDto } from '@oll/shared'
import { api } from '../api/client'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<{ user: UserDto }>('/api/auth/me')).user,
  })
}

export function RequireAuth({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const me = useMe()
  if (me.isPending) return <div className="p-8 text-center text-gray-400">加载中…</div>
  if (me.isError) return <Navigate to="/login" replace />
  if (adminOnly && me.data.role !== 'admin') return <Navigate to="/library" replace />
  return <>{children}</>
}
