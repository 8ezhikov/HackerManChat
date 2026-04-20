import type { Page } from '@playwright/test'
import { readFileSync } from 'fs'

export type Creds = { email: string; password: string; username: string }

export function loadCreds(file: string): Creds {
  return JSON.parse(readFileSync(file, 'utf-8'))
}

export async function loginAs(page: Page, creds: Creds) {
  await page.goto('/')
  await page.fill('input[placeholder="EMAIL_ADDRESS"]', creds.email)
  await page.fill('input[placeholder="PASSWORD"]', creds.password)
  await page.click('button:has-text("SIGN_IN")')
  await page.waitForSelector('button:has-text("Public Rooms")', { timeout: 10000 })
}

/** Creates a room via the Public Rooms browser and returns the room name. */
export async function createRoom(page: Page, name: string, visibility: 'public' | 'private' = 'public') {
  await page.click('nav button:has-text("Public Rooms")')
  const createBtn = page.locator('button:has-text("+ Create room")').last()
  await createBtn.waitFor({ state: 'visible', timeout: 5000 })
  await createBtn.click()
  await page.fill('input[placeholder="Room name"]', name)
  if (visibility === 'private') {
    await page.locator('div.fixed select').selectOption('private')
  }
  await page.waitForTimeout(200)
  await page.locator('div.fixed button:has-text("Create")').click()
  // Wait for room to appear in sidebar
  await page.locator(`button:has-text("# ${name}")`).waitFor({ state: 'visible', timeout: 10000 })
  return name
}

/** Joins an existing room by searching in the public room browser. */
export async function joinRoom(page: Page, roomName: string) {
  await page.click('nav button:has-text("Public Rooms")')
  await page.fill('input[placeholder="Search rooms..."]', roomName)
  await page.waitForTimeout(600)
  const joinBtn = page.locator('div.fixed button:has-text("Join")').first()
  await joinBtn.waitFor({ state: 'visible', timeout: 5000 })
  await joinBtn.click()
  await page.locator(`button:has-text("# ${roomName}")`).waitFor({ state: 'visible', timeout: 10000 })
}

/** Sends a friend request from page to a user identified by username. */
export async function sendFriendRequest(page: Page, targetUsername: string) {
  await page.click('nav button:has-text("Contacts")')
  await page.fill('input[placeholder="Search by username..."]', targetUsername)
  await page.locator('div.fixed button:has-text("Search")').click()
  await page.waitForTimeout(600)
  const addBtn = page.locator('div.fixed button:has-text("Add")').first()
  await addBtn.waitFor({ state: 'visible', timeout: 5000 })
  await addBtn.click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
}

/** Accepts the first pending friend request on page. */
export async function acceptFriendRequest(page: Page) {
  await page.click('nav button:has-text("Contacts")')
  await page.waitForTimeout(300)
  await page.locator('div.fixed button:has-text("Requests")').click()
  await page.waitForTimeout(300)
  const acceptBtn = page.locator('div.fixed button:has-text("Accept")').first()
  await acceptBtn.waitFor({ state: 'visible', timeout: 8000 })
  await acceptBtn.click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
}

/** Establishes a friendship between alice (sender) and bob (receiver) via UI. */
export async function makeFriends(alicePage: Page, bobPage: Page, bobUsername: string) {
  await sendFriendRequest(alicePage, bobUsername)
  await acceptFriendRequest(bobPage)
}
