import { test as setup, expect } from '@playwright/test'

const authFile = '.auth/alice.json'
const bobAuthFile = '.auth/bob.json'

const uniqueId = Date.now()

setup('authenticate alice', async ({ page }) => {
  await page.goto('/')

  // Register alice
  await page.click('button:has-text("Register")')
  await page.fill('input[placeholder="Email"]', `alice-${uniqueId}@example.com`)
  await page.fill('input[placeholder="Username"]', `alice-${uniqueId}`)
  await page.fill('input[placeholder="Password"]', 'password123')
  await page.click('button:has-text("Create account")')

  // Wait for ChatApp to render (user state set)
  await page.waitForSelector('button:has-text("Browse")', { timeout: 10000 })

  await page.context().storageState({ path: authFile })
})

setup('authenticate bob', async ({ page }) => {
  await page.goto('/')

  const registerBtn = page.locator('button:has-text("Register")')
  await registerBtn.click()

  await page.fill('input[placeholder="Email"]', `bob-${uniqueId}@example.com`)
  await page.fill('input[placeholder="Username"]', `bob-${uniqueId}`)
  await page.fill('input[placeholder="Password"]', 'password123')
  await page.click('button:has-text("Create account")')

  await page.waitForSelector('button:has-text("Browse")', { timeout: 10000 })

  await page.context().storageState({ path: bobAuthFile })
})
