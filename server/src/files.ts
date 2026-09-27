import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

/** 书籍魔数：PDF = '%PDF-'；EPUB = ZIP 头 'PK\x03\x04' */
export function sniffFormat(bytes: Uint8Array): 'pdf' | 'epub' | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
  ) return 'pdf'
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'epub'
  return null
}

export function sniffImage(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'webp'
  return null
}

/**
 * 解析单段 Range。返回：null = 无/不可识别（按全量响应）；
 * 'invalid' = 语法可识别但范围非法（响应 416）；否则为闭区间 {start,end}。
 */
export function parseRange(header: string | null, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (suffix <= 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Number(m[2])
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return 'invalid'
  if (end >= size) end = size - 1
  if (start > end || start >= size) return 'invalid'
  return { start, end }
}

export function ensureDataDirs(dataDir: string): void {
  mkdirSync(join(dataDir, 'books'), { recursive: true })
  mkdirSync(join(dataDir, 'covers'), { recursive: true })
}
