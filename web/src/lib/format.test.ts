import { test, expect } from 'vitest'
import { formatBytes, formatPercent } from './format'

test('formatBytes 边界', () => {
  expect(formatBytes(0)).toBe('0 B')
  expect(formatBytes(512)).toBe('512 B')
  expect(formatBytes(1024)).toBe('1.0 KB')
  expect(formatBytes(1536)).toBe('1.5 KB')
  expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB')
  expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 GB')
})

test('formatPercent 取整', () => {
  expect(formatPercent(0)).toBe('0%')
  expect(formatPercent(45.6)).toBe('46%')
  expect(formatPercent(100)).toBe('100%')
})
