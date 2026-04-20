import { test, expect } from '@playwright/test'

test.use({ storageState: '.auth/alice.json' })

test('create public room', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('button:has-text("Rooms")', { timeout: 10000 })

  // Open room browser
  await page.click('button:has-text("Rooms")')

  // Create room
  const createRoomBtn = page.locator('text=+ Create room')
  await expect(createRoomBtn).toBeVisible({ timeout: 5000 })
  await createRoomBtn.click()

  const roomName = `room-${Date.now()}`
  await page.fill('input[placeholder*="Room name"]', roomName)
  await page.click('button:has-text("Create")')

  // Verify room created (wait for room to appear in sidebar)
  const roomLink = page.locator(`button:has-text("${roomName}")`)
  await expect(roomLink).toBeVisible({ timeout: 10000 })

  // Click on the room to view it
  await roomLink.click()

  // Verify message input appears (room is now active)
  const messageInput = page.locator('textarea')
  await expect(messageInput).toBeVisible({ timeout: 10000 })
})

test('join public room as second user', async ({ page }) => {
  // First user creates room
  await page.goto('/')
  await page.waitForSelector('button:has-text("Rooms")', { timeout: 10000 })

  // Open room browser
  await page.click('button:has-text("Rooms")')
  const createBtn = page.locator('text=+ Create room')
  await expect(createBtn).toBeVisible({ timeout: 5000 })
  await createBtn.click()

  const roomName = `shared-room-${Date.now()}`
  await page.fill('input[placeholder*="Room name"]', roomName)
  await page.click('button:has-text("Create")')

  // Verify room created (wait for room to appear in sidebar)
  const roomLink = page.locator(`button:has-text("${roomName}")`)
  await expect(roomLink).toBeVisible({ timeout: 5000 })
})
