import { test, expect } from 'vitest'
import { registerSchema, progressSchema } from './index.js'

test('registerSchema: 拒绝过短密码', () => {
  const r = registerSchema.safeParse({ username: 'alice', password: 'short' })
  expect(r.success).toBe(false)
})

test('registerSchema: 接受合法输入且 inviteCode 可选', () => {
  const r = registerSchema.safeParse({ username: 'alice_1', password: 'password123' })
  expect(r.success).toBe(true)
})

test('progressSchema: percent 必须在 0-100', () => {
  expect(progressSchema.safeParse({ locator: 'epubcfi(/6/4!/4/2)', percent: 42.5 }).success).toBe(true)
  expect(progressSchema.safeParse({ locator: 'x', percent: 101 }).success).toBe(false)
})
