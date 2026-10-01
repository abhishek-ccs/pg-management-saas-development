import { test, expect } from '@playwright/test'

test.describe('StayBook Production Launch Verification', () => {
  test('1. Landing page loads with valid semantic structure', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/StayBook/)

    // Verify main landmark
    const main = page.locator('#main-content')
    await expect(main).toBeVisible()

    // Verify skip link
    const skipLink = page.locator('a[href="#main-content"]')
    await expect(skipLink).toBeAttached()
  })

  test('2. Health check endpoint responds with 200 and healthy status', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('healthy')
    expect(body.database.status).toBe('connected')
    expect(typeof body.database.latencyMs).toBe('number')
  })

  test('3. Legal pages render properly with disclaimer header', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.locator('h1')).toContainText('Privacy Policy')
    await expect(page.getByText('Needs Final Lawyer Review')).toBeVisible()

    await page.goto('/terms')
    await expect(page.locator('h1')).toContainText('Terms of Service')
  })
})
