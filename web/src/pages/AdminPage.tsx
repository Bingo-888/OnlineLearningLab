import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InviteDto, UserDto } from '@oll/shared'
import { api, ApiError } from '../api/client'

export function AdminPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [resetFor, setResetFor] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await api.get<{ users: UserDto[] }>('/api/admin/users')).users,
  })
  const invites = useQuery({
    queryKey: ['admin', 'invites'],
    queryFn: async () => (await api.get<{ invites: InviteDto[] }>('/api/admin/invites')).invites,
  })

  const createInvite = useMutation({
    mutationFn: async () => (await api.post<{ invite: InviteDto }>('/api/admin/invites')).invite,
    onSuccess: (invite) => {
      setMessage(`已生成邀请码：${invite.code}`)
      void qc.invalidateQueries({ queryKey: ['admin', 'invites'] })
    },
  })

  const resetPassword = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      await api.post(`/api/admin/users/${id}/password`, { newPassword: password })
    },
    onSuccess: () => {
      setMessage('密码已重置，该用户的所有登录会话已失效')
      setResetFor(null)
      setNewPassword('')
    },
    onError: (err) => {
      setMessage(err instanceof ApiError && err.message === 'invalid_input' ? '密码至少需要 8 位' : '重置失败')
    },
  })

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center gap-4">
        <button onClick={() => navigate('/library')} className="rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700">
          ← 书架
        </button>
        <h1 className="text-2xl font-bold">管理</h1>
      </header>

      {message && <p data-testid="admin-message" className="mb-4 rounded bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">{message}</p>}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">邀请码</h2>
          <button data-testid="invite-generate" onClick={() => createInvite.mutate()}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">生成邀请码</button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800">
              <th className="py-2">邀请码</th><th>状态</th><th>生成时间</th>
            </tr>
          </thead>
          <tbody>
            {invites.data?.map((inv) => (
              <tr key={inv.code} className="border-b border-gray-100 dark:border-gray-900">
                <td className="py-2 font-mono" data-testid="invite-code">{inv.code}</td>
                <td>{inv.usedBy ? '已使用' : '未使用'}</td>
                <td>{new Date(inv.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">用户</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-800">
              <th className="py-2">用户名</th><th>角色</th><th>注册时间</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 dark:border-gray-900" data-testid="user-row">
                <td className="py-2">{u.username}</td>
                <td>{u.role === 'admin' ? '管理员' : '学员'}</td>
                <td>{new Date(u.createdAt).toLocaleString()}</td>
                <td className="text-right">
                  {resetFor === u.id ? (
                    <span className="inline-flex items-center gap-2">
                      <input
                        data-testid="reset-input"
                        type="password"
                        placeholder="新密码"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-32 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-950"
                      />
                      <button data-testid="reset-submit" onClick={() => resetPassword.mutate({ id: u.id, password: newPassword })}
                        className="rounded bg-blue-600 px-2 py-1 text-white">确认</button>
                      <button onClick={() => setResetFor(null)} className="text-gray-500">取消</button>
                    </span>
                  ) : (
                    <button data-testid="reset-start" onClick={() => { setResetFor(u.id); setNewPassword('') }}
                      className="text-blue-600 hover:underline">重置密码</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
