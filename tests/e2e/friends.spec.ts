import { test, expect } from '@playwright/test'
import { loginAs, loadCreds } from './helpers'

test('send friend request and accept — both appear in friend list', async ({ browser }) => {
  const aliceCreds = loadCreds('.auth/alice-creds.json')
  const bobCreds = loadCreds('.auth/bob-creds.json')

  const alicePage = await browser.newPage()
  await loginAs(alicePage, aliceCreds)

  const bobPage = await browser.newPage()
  await loginAs(bobPage, bobCreds)

  // Alice opens Contacts modal and searches for Bob
  await alicePage.click('nav button:has-text("Contacts")')
  await alicePage.fill('input[placeholder="Search by username..."]', bobCreds.username)
  await alicePage.locator('div.fixed button:has-text("Search")').click()
  await alicePage.waitForTimeout(600)

  const addBtn = alicePage.locator('div.fixed button:has-text("Add")').first()
  await expect(addBtn).toBeVisible({ timeout: 5000 })
  await addBtn.click()

  // Button changes to "Sent" indicating the request was sent
  await expect(alicePage.locator('div.fixed button:has-text("Sent")')).toBeVisible({ timeout: 5000 })
  await alicePage.keyboard.press('Escape')

  // Wait for server to process request
  await bobPage.waitForTimeout(1000)

  // Bob opens Contacts → Requests tab and accepts
  await bobPage.click('nav button:has-text("Contacts")')
  await bobPage.waitForTimeout(300)
  await bobPage.locator('div.fixed button:has-text("Requests")').click()
  await bobPage.waitForTimeout(300)
  const acceptBtn = bobPage.locator('div.fixed button:has-text("Accept")').first()
  await expect(acceptBtn).toBeVisible({ timeout: 8000 })
  await acceptBtn.click()

  // After accepting, Bob should see Alice in Contacts sidebar
  await expect(bobPage.locator('div.fixed text=// No pending requests.')).toBeVisible({ timeout: 5000 })
  await bobPage.keyboard.press('Escape')

  // Alice's sidebar should now show Bob as a contact
  await expect(alicePage.locator(`.truncate:has-text("${bobCreds.username}")`)).toBeVisible({ timeout: 10000 })

  await alicePage.close()
  await bobPage.close()
})

test('decline friend request — request disappears', async ({ browser }) => {
  const aliceCreds = loadCreds('.auth/alice-creds.json')
  const bobCreds = loadCreds('.auth/bob-creds.json')

  const alicePage = await browser.newPage()
  await loginAs(alicePage, aliceCreds)

  const bobPage = await browser.newPage()
  await loginAs(bobPage, bobCreds)

  // Alice sends friend request to Bob
  await alicePage.click('nav button:has-text("Contacts")')
  await alicePage.fill('input[placeholder="Search by username..."]', bobCreds.username)
  await alicePage.locator('div.fixed button:has-text("Search")').click()
  await alicePage.waitForTimeout(600)
  const addBtn = alicePage.locator('div.fixed button:has-text("Add")').first()
  await expect(addBtn).toBeVisible({ timeout: 5000 })
  await addBtn.click()
  await alicePage.keyboard.press('Escape')

  // Wait for server to process request
  await bobPage.waitForTimeout(1000)

  // Bob declines
  await bobPage.click('nav button:has-text("Contacts")')
  await bobPage.waitForTimeout(300)
  await bobPage.locator('div.fixed button:has-text("Requests")').click()
  await bobPage.waitForTimeout(300)
  const declineBtn = bobPage.locator('div.fixed button:has-text("Decline")').first()
  await expect(declineBtn).toBeVisible({ timeout: 8000 })
  await declineBtn.click()

  // Requests list now empty
  await expect(bobPage.locator('div.fixed text=// No pending requests.')).toBeVisible({ timeout: 5000 })

  await alicePage.close()
  await bobPage.close()
})
