#!/usr/bin/env node
// 用法：node scripts/set-version.mjs <x.y.z>（等价 `pnpm version:set x.y.z`）
// 把根 package.json 与 shared/server/web 的 version 同步为给定值。只改文件，不 commit、不 tag。
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILES = ['package.json', 'shared/package.json', 'server/package.json', 'web/package.json']
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const next = process.argv[2]
if (!next || !SEMVER.test(next)) {
  console.error('用法：node scripts/set-version.mjs <x.y.z>（语义化版本，可带预发布后缀，如 0.2.0-rc.1）')
  process.exit(1)
}

for (const rel of FILES) {
  const file = join(ROOT, rel)
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  if (pkg.version === next) {
    console.log(`- ${rel}: 已是 ${next}，跳过`)
    continue
  }
  const prev = pkg.version
  pkg.version = next
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`- ${rel}: ${prev} → ${next}`)
}

console.log(`
下一步：
  1. 在 CHANGELOG.md 顶部补 "## [${next}] - <日期>" 条目（否则 pnpm build 会被 check 拦下）
  2. pnpm build 自校验（内含 scripts/check-version.mjs）
  3. commit 之后 git tag -a v${next} -m "..."（tag 推送后不要改写）`)
