#!/usr/bin/env node
// 版本一致性门禁：校验根 + shared/server/web 四个 package.json 版本一致且合法，且 CHANGELOG.md 有对应条目。
// 根 `pnpm build` 前置调用（Docker 构建同样经过）；手动运行：pnpm version:check
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILES = ['package.json', 'shared/package.json', 'server/package.json', 'web/package.json']
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const versions = FILES.map((rel) => [rel, JSON.parse(readFileSync(join(ROOT, rel), 'utf8')).version])
const errors = []

if (new Set(versions.map(([, v]) => v)).size > 1) {
  errors.push('四处版本号不一致（单一事实来源 = 根 package.json，修复：pnpm version:set <x.y.z>）')
  for (const [rel, v] of versions) errors.push(`${rel} = ${v}`)
} else {
  const version = versions[0][1]
  if (!SEMVER.test(version)) errors.push(`根 package.json 的 version "${version}" 不是合法语义化版本（期望 x.y.z）`)
  let changelog = ''
  try {
    changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
  } catch {
    // 文件不存在时按缺少条目处理
  }
  if (!changelog.includes(`## [${version}]`)) errors.push(`CHANGELOG.md 缺少 "## [${version}]" 条目（版本升级必须同步补发布记录）`)
}

if (errors.length) {
  console.error('[version] 失败：')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(`[version] OK v${versions[0][1]}：4 个 package.json 一致，CHANGELOG 有条目`)
