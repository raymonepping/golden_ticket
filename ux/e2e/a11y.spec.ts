// a11y.spec.ts — axe-core WCAG 2.1 A/AA scan of every golden_ticket screen at
// desktop and phone width, plus the screenshots the design review uses.
// Mirrors Arcanium's tests/a11y.spec.ts.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signInIfRequired } from './helpers'

const ROUTES = ['/', '/layers', '/engines', '/machines', '/front-door', '/instances/gt-vault-1', '/instances/gt-vault-s']
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]
const SHOTS = process.env.GT_SHOTS_DIR

// The fast list renders first; navigate and wait for the deep posture response.
async function open(page: Page, route: string) {
  const deep = page.waitForResponse(response => response.url().endsWith('/api/instances') && response.ok(), { timeout: 60_000 })
  const engines = route === '/engines' ? page.waitForResponse(response => response.url().endsWith('/api/engines') && response.ok(), { timeout: 60_000 }) : null
  await page.goto(route)
  await deep
  await engines
  await page.waitForSelector('.vg-hero')
  await page.waitForTimeout(400)
}

async function scan(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return result.violations.map(v => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)
}

for (const viewport of VIEWPORTS) {
  test(`@a11y every screen at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await signInIfRequired(page)
    const found: string[] = []
    for (const route of ROUTES) {
      await open(page, route)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${viewport.name}${route.replace(/\//g, '_') || '_'}.png`, fullPage: true })
      for (const violation of await scan(page)) found.push(`${route}: ${violation}`)
    }
    expect(found).toEqual([])
  })
}

test('@a11y evidence drawer and action dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signInIfRequired(page)
  await open(page, '/machines')
  await page.locator('.instance-card').first().locator('.posture-pill').last().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(400) // let the slide-in finish
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop_drawer.png` })
  expect(await scan(page)).toEqual([])
  await page.keyboard.press('Escape')

  const restart = page.locator('.instance-card').first().getByRole('button', { name: 'Restart' })
  if (await page.locator('.env-badge', { hasText: 'VM' }).count()) {
    // Observe-only VM mode: no lifecycle controls anywhere.
    await expect(page.locator('.card-actions')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Restart|Stop|Start|Move to trash|Purge/ })).toHaveCount(0)
    return
  }
  await restart.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(400) // let the fade-in finish
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/desktop_dialog.png` })
  expect(await scan(page)).toEqual([])
  await page.getByRole('button', { name: 'Cancel' }).click()
})
