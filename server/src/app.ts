import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import type { DatabaseSync } from 'node:sqlite'
import type { AppEnv } from './types.js'
import { authRoutes } from './routes/auth.js'
import { adminRoutes } from './routes/admin.js'
import { bookRoutes } from './routes/books.js'
import { makeRateLimiter } from './auth.js'
import { VERSION } from './version.js'

export type { AppEnv } from './types.js'

export interface AppOptions {
  db: DatabaseSync
  dataDir: string
  maxUploadMb?: number
  cookieSecure?: boolean
  webRoot?: string | null   // 生产静态资源目录；开发/测试传 null
}

export function createApp(opts: AppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  app.get('/api/health', (c) => c.json({ ok: true, version: VERSION }))
  const loginLimiter = makeRateLimiter({ limit: 10, windowMs: 10 * 60_000 })
  app.route('/api/auth', authRoutes(opts, loginLimiter))
  app.route('/api/books', bookRoutes(opts))
  app.route('/api/admin', adminRoutes(opts))
  if (opts.webRoot) {
    app.use('*', serveStatic({ root: opts.webRoot }))
    app.get('*', (c, next) => {
      if (c.req.path.startsWith('/api/')) return next()
      return serveStatic({ root: opts.webRoot!, path: 'index.html' })(c, next)
    })
  }
  app.notFound((c) => c.json({ error: 'not_found' }, 404))
  return app
}
