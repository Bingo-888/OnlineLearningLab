import { z } from 'zod'

// ---- zod 请求契约（server 校验 + web 表单复用）----
export const usernameSchema = z.string().min(3).max(32).regex(/^[A-Za-z0-9_]+$/)
export const passwordSchema = z.string().min(8).max(128)

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  inviteCode: z.string().min(4).max(64).optional(),
})

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export const progressSchema = z.object({
  locator: z.string().min(1).max(2048),
  percent: z.number().min(0).max(100),
})

export const resetPasswordSchema = z.object({ newPassword: passwordSchema })

// ---- DTO ----
export type Role = 'admin' | 'learner'
export type BookFormat = 'epub' | 'pdf'

export interface UserDto { id: string; username: string; role: Role; createdAt: number }
export interface BookDto {
  id: string; title: string; author: string | null; format: BookFormat
  sizeBytes: number; hasCover: boolean; uploadedAt: number
  progress: { locator: string; percent: number } | null
}
export interface InviteDto { code: string; createdAt: number; usedBy: string | null; usedAt: number | null }
