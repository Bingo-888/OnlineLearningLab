import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'

export function RegisterPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/auth/register', {
        username,
        password,
        inviteCode: inviteCode.trim() ? inviteCode.trim() : undefined,
      })
      await qc.invalidateQueries({ queryKey: ['me'] })
      navigate('/library')
    } catch (err) {
      const map: Record<string, string> = {
        invite_required: '该平台已有用户，注册需要邀请码',
        invalid_invite: '邀请码无效或已被使用',
        username_taken: '用户名已被占用',
        invalid_input: '输入不合法：用户名 3-32 位字母数字下划线，密码至少 8 位',
      }
      setError(err instanceof ApiError ? map[err.message] ?? '注册失败，请重试' : '注册失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={onSubmit} className="w-80 space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-xl font-semibold">注册 · 在线学习平台</h1>
        <p className="text-xs text-gray-500">如果你是第一个用户，将自动成为管理员，无需邀请码。</p>
        <input data-testid="register-username" className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950" placeholder="用户名"
          value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        <input data-testid="register-password" className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950" placeholder="密码（至少 8 位）" type="password"
          value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <input data-testid="register-invite" className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950" placeholder="邀请码（首个用户留空）"
          value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
        {error && <p data-testid="register-error" className="text-sm text-red-500">{error}</p>}
        <button data-testid="register-submit" disabled={busy} className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? '注册中…' : '注册'}
        </button>
        <p className="text-sm text-gray-500">已有账号？<Link className="text-blue-600 hover:underline" to="/login">登录</Link></p>
      </form>
    </div>
  )
}
