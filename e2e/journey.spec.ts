import { test, expect } from '@playwright/test'
import path from 'node:path'

test.describe.configure({ mode: 'serial' }) // 三个场景共享同一后端数据，顺序执行

const FIXTURE_PDF = path.resolve('e2e/.fixtures/test.pdf')
const FIXTURE_EPUB = path.resolve('e2e/.fixtures/test.epub')
const ADMIN = { username: 'e2eadmin', password: 'e2epassword' }

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByTestId('login-username').fill(ADMIN.username)
  await page.getByTestId('login-password').fill(ADMIN.password)
  await page.getByTestId('login-submit').click()
  await expect(page.getByRole('heading', { name: '书架' })).toBeVisible()
}

test('第一幕：注册首用户（管理员）并上传 PDF 与 EPUB', async ({ page }) => {
  await page.goto('/register')
  await page.getByTestId('register-username').fill(ADMIN.username)
  await page.getByTestId('register-password').fill(ADMIN.password)
  await page.getByTestId('register-submit').click()
  await expect(page.getByTestId('empty-state')).toBeVisible()

  await page.getByTestId('upload-button').click()
  await page.getByTestId('upload-input').setInputFiles(FIXTURE_PDF)
  await expect(page.getByTestId('book-card').filter({ hasText: 'E2E 测试 PDF' })).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('upload-button').click()
  await page.getByTestId('upload-input').setInputFiles(FIXTURE_EPUB)
  await expect(page.getByTestId('book-card').filter({ hasText: 'E2E 测试 EPUB' })).toBeVisible({ timeout: 30_000 })

  // PDF 封面（首页渲染为 JPEG）应出现在卡片上
  await expect(page.getByTestId('cover-img').first()).toBeVisible()
})

test('第二幕：PDF 阅读、翻页、进度跨刷新恢复', async ({ page }) => {
  await login(page)
  await page.getByTestId('book-card').filter({ hasText: 'E2E 测试 PDF' }).click()

  await expect(page.getByTestId('reader-title')).toHaveText('E2E 测试 PDF')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('page-next').click()
  await expect(page.getByTestId('page-input')).toHaveValue('2')

  // 进度防抖 2s 落库，留一点余量再刷新
  await page.waitForTimeout(3_000)
  await page.reload()
  await expect(page.getByTestId('page-input')).toHaveValue('2', { timeout: 30_000 })
})

test('第三幕：EPUB 正文渲染 + 目录面板', async ({ page }) => {
  await login(page)
  await page.getByTestId('book-card').filter({ hasText: 'E2E 测试 EPUB' }).click()

  await expect(page.getByTestId('reader-title')).toHaveText('E2E 测试 EPUB')
  // epub.js 把正文渲染在 iframe 里
  const frame = page.frameLocator('iframe')
  await expect(frame.getByText('HELLO-EPUB-MARKER')).toBeVisible({ timeout: 30_000 })

  await page.getByTestId('toc-button').click()
  await expect(page.getByTestId('toc-panel')).toBeVisible()
  await expect(page.getByTestId('toc-item').first()).toContainText('第 1 章')
})
