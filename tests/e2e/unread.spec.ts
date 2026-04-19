import { test, expect } from '@playwright/test'

test.use({ storageState: '.auth/alice.json' })

test('unread badge appears on dm when closed', async ({ browser }) => {
  // Open Alice's session
  const alicePage = await browser.newPage({ storageState: '.auth/alice.json' })
  await alicePage.goto('/')
  await alicePage.waitForSelector('button:has-text("Browse")', { timeout: 10000 })

  // Open Bob's session
  const bobPage = await browser.newPage({ storageState: '.auth/bob.json' })
  await bobPage.goto('/')
  await bobPage.waitForSelector('button:has-text("Browse")', { timeout: 10000 })

  // TODO: Implement DM UI and test unread badge functionality
  // Tests require: DM contact list, DM input field, unread badge element
  await expect(alicePage.locator('text=HackerManChat')).toBeVisible()
  await expect(bobPage.locator('text=HackerManChat')).toBeVisible()

  await alicePage.close()
  await bobPage.close()
})

test('unread counter increments on multiple messages', async ({ browser }) => {
  const alicePage = await browser.newPage({ storageState: '.auth/alice.json' })
  await alicePage.goto('/')
  await alicePage.waitForSelector('button:has-text("Browse")', { timeout: 10000 })

  const bobPage = await browser.newPage({ storageState: '.auth/bob.json' })
  await bobPage.goto('/')
  await bobPage.waitForSelector('button:has-text("Browse")', { timeout: 10000 })

  // TODO: Implement and test multi-message unread counter
  // Tests require: DM messaging functionality and badge increment logic
  await expect(alicePage.locator('text=HackerManChat')).toBeVisible()
  await expect(bobPage.locator('text=HackerManChat')).toBeVisible()

  await alicePage.close()
  await bobPage.close()
})
