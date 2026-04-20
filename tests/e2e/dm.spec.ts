import { test, expect } from '@playwright/test'
import { loginAs, loadCreds, makeFriends } from './helpers'

test('open dm with friend and send message', async ({ browser }) => {
  const aliceCreds = loadCreds('.auth/alice-creds.json')
  const bobCreds = loadCreds('.auth/bob-creds.json')

  const alicePage = await browser.newPage()
  await loginAs(alicePage, aliceCreds)

  const bobPage = await browser.newPage()
  await loginAs(bobPage, bobCreds)

  await makeFriends(alicePage, bobPage, bobCreds.username)

  // Alice opens DM with Bob by clicking Bob in the Contacts sidebar
  const bobContact = alicePage.locator(`.truncate:has-text("${bobCreds.username}")`).first()
  await expect(bobContact).toBeVisible({ timeout: 10000 })
  await bobContact.click()

  // Chat area opens — message input visible
  await expect(alicePage.locator('textarea')).toBeVisible({ timeout: 5000 })

  // Alice sends a message
  await alicePage.locator('textarea').fill('hello bob from DM')
  await alicePage.keyboard.press('Enter')

  // Alice sees her own message
  await expect(alicePage.locator('text=hello bob from DM')).toBeVisible({ timeout: 5000 })

  await alicePage.close()
  await bobPage.close()
})

test('blocking a friend freezes the dm', async ({ browser }) => {
  const aliceCreds = loadCreds('.auth/alice-creds.json')
  const bobCreds = loadCreds('.auth/bob-creds.json')

  const alicePage = await browser.newPage()
  await loginAs(alicePage, aliceCreds)

  const bobPage = await browser.newPage()
  await loginAs(bobPage, bobCreds)

  await makeFriends(alicePage, bobPage, bobCreds.username)

  // Alice opens DM with Bob
  const bobContact = alicePage.locator(`.truncate:has-text("${bobCreds.username}")`).first()
  await expect(bobContact).toBeVisible({ timeout: 10000 })
  await bobContact.click()
  await expect(alicePage.locator('textarea')).toBeVisible({ timeout: 5000 })

  // Alice sends one message to open DM history
  await alicePage.locator('textarea').fill('hello before block')
  await alicePage.keyboard.press('Enter')
  await expect(alicePage.locator('text=hello before block')).toBeVisible({ timeout: 5000 })

  // Alice blocks Bob: hover over Bob in sidebar → click "✕"
  const bobSidebarItem = alicePage.locator(`div.relative:has(.truncate:has-text("${bobCreds.username}"))`)
  await bobSidebarItem.hover()
  const blockBtn = bobSidebarItem.locator('button[title="Block user"]')
  await expect(blockBtn).toBeVisible({ timeout: 3000 })
  await blockBtn.click()

  // The frozen DM banner should appear in the chat area
  await expect(alicePage.locator('text=This conversation is frozen')).toBeVisible({ timeout: 5000 })

  // The input area should be disabled (pointer-events-none)
  const inputArea = alicePage.locator('div.pointer-events-none')
  await expect(inputArea).toBeVisible({ timeout: 3000 })

  await alicePage.close()
  await bobPage.close()
})

test('dm message edit and delete', async ({ browser }) => {
  const aliceCreds = loadCreds('.auth/alice-creds.json')
  const bobCreds = loadCreds('.auth/bob-creds.json')

  const alicePage = await browser.newPage()
  await loginAs(alicePage, aliceCreds)

  const bobPage = await browser.newPage()
  await loginAs(bobPage, bobCreds)

  await makeFriends(alicePage, bobPage, bobCreds.username)

  // Alice opens DM with Bob
  const bobContact = alicePage.locator(`.truncate:has-text("${bobCreds.username}")`).first()
  await expect(bobContact).toBeVisible({ timeout: 10000 })
  await bobContact.click()
  await expect(alicePage.locator('textarea')).toBeVisible({ timeout: 5000 })

  // Alice sends a message
  await alicePage.locator('textarea').fill('dm original')
  await alicePage.keyboard.press('Enter')
  await expect(alicePage.locator('text=dm original')).toBeVisible({ timeout: 5000 })

  // Edit the message
  await alicePage.locator('text=dm original').hover()
  const editBtn = alicePage.locator('button:has-text("Edit")').first()
  await expect(editBtn).toBeVisible({ timeout: 3000 })
  await editBtn.click()

  const editInput = alicePage.locator('input[class*="bg-transparent"]')
  await editInput.fill('dm edited')
  await alicePage.keyboard.press('Enter')
  await expect(alicePage.locator('text=(edited)')).toBeVisible({ timeout: 5000 })

  // Delete the message
  await alicePage.locator('text=dm edited').hover()
  const delBtn = alicePage.locator('button:has-text("Del")').first()
  await expect(delBtn).toBeVisible({ timeout: 3000 })
  await delBtn.click()
  await expect(alicePage.locator('text=dm edited')).not.toBeVisible({ timeout: 5000 })

  await alicePage.close()
  await bobPage.close()
})
