import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const qc = useQueryClient()

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/auth/login', { username, password })
      await qc.invalidateQueries({ queryKey: ['me'] })
      navigate('/library')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? '用户名或密码错误' : '登录失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={onSubmit} className="w-80 space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-xl font-semibold">登录 · 在线学习平台</h1>
        <input
          data-testid="login-username"
          className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
        <input
          data-testid="login-password"
          className="w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          placeholder="密码"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <p data-testid="login-error" className="text-sm text-red-500">{error}</p>}
        <button
          data-testid="login-submit"
          disabled={busy}
          className="w-full rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
        </button>
        <p className="text-sm text-gray-500">
          没有账号？<Link className="text-blue-600 hover:underline" to="/register">注册</Link>
        </p>
      </form>
    </div>
  )
}
