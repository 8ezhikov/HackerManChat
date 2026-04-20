import { test, expect } from '@playwright/test'

test('full auth flow - register, login, logout', async ({ page }) => {
  // Register new user
  await page.goto('/')
  await page.click('button:has-text("REGISTER")')

  const uniqueEmail = `user-${Date.now()}@example.com`
  await page.fill('input[placeholder="EMAIL_ADDRESS"]', uniqueEmail)
  await page.fill('input[placeholder="USERNAME"]', `user-${Date.now()}`)
  await page.fill('input[placeholder="PASSWORD"]', 'securepassword123')
  await page.click('button:has-text("CREATE_ACCOUNT")')

  // Verify logged in - wait for ChatApp to render (Rooms button appears)
  await page.waitForSelector('button:has-text("Rooms")', { timeout: 10000 })

  // Logout: open profile dropdown then click Sign out
  await page.locator('button', { hasText: /▾/ }).click()
  const logoutBtn = page.locator('button:has-text("Sign out")')
  await expect(logoutBtn).toBeVisible({ timeout: 5000 })
  await logoutBtn.click()

  // Verify logged out - REGISTER button visible again
  await page.waitForSelector('button:has-text("REGISTER")', { timeout: 5000 })
})

test('login with invalid credentials shows error', async ({ page }) => {
  await page.goto('/')

  await page.fill('input[placeholder="EMAIL_ADDRESS"]', 'invalid@example.com')
  await page.fill('input[placeholder="PASSWORD"]', 'wrongpassword')
  await page.click('button:has-text("SIGN_IN")')

  // Expect error message - look for li with error text starting with //
  await expect(page.locator('li:has-text("//")')).toBeVisible({ timeout: 5000 })
})
