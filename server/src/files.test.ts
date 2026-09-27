import { test, expect } from 'vitest'
import { sniffFormat, sniffImage, parseRange, CONTENT_TYPES } from './files.js'

const enc = (s: string) => new TextEncoder().encode(s)

test('sniffFormat 识别 pdf / epub / 未知', () => {
  expect(sniffFormat(enc('%PDF-1.7\n...'))).toBe('pdf')
  expect(sniffFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]))).toBe('epub')
  expect(sniffFormat(enc('<html>'))).toBe(null)
  expect(sniffFormat(new Uint8Array([]))).toBe(null)
})

test('sniffImage 识别 png / jpg / webp / 未知', () => {
  expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('png')
  expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
  expect(
    sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])),
  ).toBe('webp')
  expect(sniffImage(enc('GIF89a'))).toBe(null)
})

test('parseRange：无 header / 常规 / 后缀 / 越界钳制 / 非法', () => {
  expect(parseRange(null, 100)).toBe(null)
  expect(parseRange('bytes=0-3', 100)).toEqual({ start: 0, end: 3 })
  expect(parseRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 })
  expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
  expect(parseRange('bytes=5-999', 100)).toEqual({ start: 5, end: 99 }) // 钳制
  expect(parseRange('bytes=100-101', 100)).toBe('invalid') // start >= size
  expect(parseRange('bytes=7-3', 100)).toBe('invalid')
  expect(parseRange('bytes=abc', 100)).toBe(null)
})

test('CONTENT_TYPES 完整', () => {
  expect(CONTENT_TYPES.pdf).toBe('application/pdf')
  expect(CONTENT_TYPES.epub).toBe('application/epub+zip')
  expect(CONTENT_TYPES.jpg).toBe('image/jpeg')
})
