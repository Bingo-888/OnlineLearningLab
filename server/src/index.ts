import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { openDb } from './db.js'
import { ensureDataDirs } from './files.js'
import { VERSION } from './version.js'

try {
  process.loadEnvFile()
} catch {
  // .env 可选（Docker 场景由 compose 注入环境变量）
}

const port = Number(process.env.PORT ?? 3000)
const dataDir = resolve(process.env.DATA_DIR ?? './data')
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? 200)
const cookieSecure = process.env.COOKIE_SECURE === 'true'
const webRootEnv = process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : null
const webRoot = webRootEnv && existsSync(webRootEnv) ? webRootEnv : null

ensureDataDirs(dataDir)
const db = openDb(resolve(dataDir, 'db.sqlite'))
const app = createApp({ db, dataDir, maxUploadMb, cookieSecure, webRoot })

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[oll] v${VERSION} listening on http://localhost:${info.port} | dataDir=${dataDir} | webRoot=${webRoot ?? '(dev: 由 Vite 提供)'}`)
})
