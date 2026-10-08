// signin.spec.ts — Keycloak sign-in through the BFF for each person, the
// persona pill, role gating (host mode) and an axe scan of the sign-in page.
// Passwords are provided at run time by scripts/ui-signin-test.sh (from Vault).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signIn } from './helpers'

const PEOPLE = [
  { uid: 'viewer', role: 'viewer' },
  { uid: 'barend', role: 'operator' },
  { uid: 'raymon', role: 'admin' },
] as const

test('@a11y sign-in page', async ({ page }) => {
  await page.goto('/signin')
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations.map(v => v.id)).toEqual([])
  if (process.env.GT_SHOTS_DIR) await page.screenshot({ path: `${process.env.GT_SHOTS_DIR}/signin.png` })
})

for (const person of PEOPLE) {
  test(`sign-in and role gating: ${person.uid}`, async ({ page }) => {
    test.skip(!process.env[`GT_PW_${person.uid.toUpperCase()}`], 'run through scripts/ui-signin-test.sh')
    await signIn(page, person.uid)
    await expect(page.locator('.persona-name')).toHaveText(person.uid)
    await expect(page.locator('.persona-role')).toHaveText(person.role)
    await page.goto('/machines')
    await page.waitForSelector('.instance-card')
    const vm = await page.locator('.env-badge', { hasText: 'VM' }).count() > 0
    const card = page.locator('.instance-card', { hasText: 'gt-vault-2' })
    if (vm || person.role === 'viewer') {
      await expect(page.locator('.card-actions')).toHaveCount(0)
    } else {
      await expect(card.getByRole('button', { name: 'Restart' })).toBeVisible()
      await card.getByRole('button', { name: /More actions/ }).click()
      const trash = card.getByRole('menuitem', { name: 'Move to trash' })
      if (person.role === 'admin') await expect(trash).toBeVisible()
      else await expect(trash).toHaveCount(0)
    }
    if (process.env.GT_SHOTS_DIR) await page.screenshot({ path: `${process.env.GT_SHOTS_DIR}/${vm ? 'vm' : 'host'}-${person.uid}.png` })
  })
}

test('API refuses requests without a session', async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true })
  expect((await anon.get('/api/instances')).status()).toBe(401)
  expect((await anon.get('/api/health')).status()).toBe(200)
  await anon.dispose()
})
