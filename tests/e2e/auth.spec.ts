import { test, expect } from '@playwright/test'

test('full auth flow - register, login, logout', async ({ page }) => {
  // Register new user
  await page.goto('/')
  await page.click('button:has-text("Register")')

  const uniqueEmail = `user-${Date.now()}@example.com`
  await page.fill('input[placeholder="Email"]', uniqueEmail)
  await page.fill('input[placeholder="Username"]', `user-${Date.now()}`)
  await page.fill('input[placeholder="Password"]', 'securepassword123')
  await page.click('button:has-text("Create account")')

  // Verify logged in - wait for ChatApp to render (Browse button appears)
  await page.waitForSelector('button:has-text("Browse")', { timeout: 10000 })

  // Logout using the "out" button in the header
  const logoutBtn = page.locator('button:has-text("out")')
  await expect(logoutBtn).toBeVisible({ timeout: 5000 })
  await logoutBtn.click()

  // Verify logged out - Register button visible again
  await page.waitForSelector('button:has-text("Register")', { timeout: 5000 })
})

test('login with invalid credentials shows error', async ({ page }) => {
  await page.goto('/')

  await page.fill('input[placeholder="Email"]', 'invalid@example.com')
  await page.fill('input[placeholder="Password"]', 'wrongpassword')
  await page.click('button:has-text("Sign in")')

  // Expect error message (any error text shown in red)
  const errorItems = page.locator('li:has-text("•")')
  await expect(errorItems).toBeVisible({ timeout: 5000 })
})
