import { test, expect } from '@playwright/test'
import { loginAs, loadCreds } from './helpers'

test.beforeEach(async ({ page }) => {
  await loginAs(page, loadCreds('.auth/alice-creds.json'))
})

test('account settings shows active sessions list', async ({ page }) => {
  // Click "Sessions" in nav → opens Account Settings modal
  await page.click('nav button:has-text("Sessions")')

  await expect(page.locator('text=/Account Settings/')).toBeVisible({ timeout: 5000 })

  // "Active Sessions" section should list at least one session (the current one)
  await expect(page.locator('text=/Active Sessions —/')).toBeVisible({ timeout: 5000 })
  const revokeBtn = page.locator('button:has-text("Revoke")').first()
  await expect(revokeBtn).toBeVisible({ timeout: 5000 })
})

test('revoking current session causes logout on page reload', async ({ page }) => {
  await page.click('nav button:has-text("Sessions")')
  await expect(page.locator('text=/Account Settings/')).toBeVisible({ timeout: 5000 })

  // Click Revoke on the current (first) session
  const revokeBtn = page.locator('button:has-text("Revoke")').first()
  await expect(revokeBtn).toBeVisible({ timeout: 5000 })
  await revokeBtn.click()

  // After revoking, the session is gone from the list
  await page.waitForTimeout(500)

  // Reload — the refresh token hits a revoked session → logout
  await page.reload()
  await page.waitForSelector('button:has-text("REGISTER")', { timeout: 10000 })
})

test('change password succeeds', async ({ page }) => {
  const creds = loadCreds('.auth/alice-creds.json')
  await page.click('nav button:has-text("Sessions")')
  await expect(page.locator('text=/Account Settings/')).toBeVisible({ timeout: 5000 })

  await page.fill('input[placeholder="Current password"]', creds.password)
  await page.fill('input[placeholder="New password (min 8 chars)"]', creds.password) // same password, just testing flow
  await page.locator('button:has-text("Change Password")').click()

  await expect(page.locator('text=Password changed.')).toBeVisible({ timeout: 5000 })
})
