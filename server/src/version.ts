import { readFileSync } from 'node:fs'

/**
 * 应用版本：运行时读取本包 package.json 的 version
 * （由 `pnpm version:set` 保证与根 package.json 同步，不做代码硬编码）。
 * dev（src/）、构建产物（dist/）、Docker（pnpm deploy 产物）三种布局下 `../package.json` 都指向 @oll/server 的清单。
 */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export const VERSION = readVersion()
