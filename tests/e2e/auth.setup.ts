import { test as setup, expect } from '@playwright/test'

const authFile = '.auth/alice.json'
const bobAuthFile = '.auth/bob.json'

const uniqueId = Date.now()

setup('authenticate alice', async ({ page }) => {
  await page.goto('/')

  // Register alice
  await page.click('button:has-text("REGISTER")')
  await page.fill('input[placeholder="EMAIL_ADDRESS"]', `alice-${uniqueId}@example.com`)
  await page.fill('input[placeholder="USERNAME"]', `alice-${uniqueId}`)
  await page.fill('input[placeholder="PASSWORD"]', 'password123')
  await page.click('button:has-text("CREATE_ACCOUNT")')

  // Wait for ChatApp to render (user state set)
  await page.waitForSelector('button:has-text("Rooms")', { timeout: 30000 })

  await page.context().storageState({ path: authFile })
})

setup('authenticate bob', async ({ page }) => {
  await page.goto('/')

  const registerBtn = page.locator('button:has-text("REGISTER")')
  await registerBtn.click()

  await page.fill('input[placeholder="EMAIL_ADDRESS"]', `bob-${uniqueId}@example.com`)
  await page.fill('input[placeholder="USERNAME"]', `bob-${uniqueId}`)
  await page.fill('input[placeholder="PASSWORD"]', 'password123')
  await page.click('button:has-text("CREATE_ACCOUNT")')

  await page.waitForSelector('button:has-text("Rooms")', { timeout: 30000 })

  await page.context().storageState({ path: bobAuthFile })
})
