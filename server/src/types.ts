export interface UserRow {
  id: string
  username: string
  password_hash: string
  role: 'admin' | 'learner'
  created_at: number
}

export type AppEnv = { Variables: { user: UserRow } }
