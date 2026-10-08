// vault-oidc.spec.ts — a person signs in to the Vault UI with OIDC through
// Keycloak (popup flow). Run: GT_UI_URL=https://<vault-node>:8200 with
// GT_PW_RAYMON set (scripts/ui-signin-test.sh style).
import { test, expect } from '@playwright/test'

test('Vault UI OIDC login as raymon', async ({ page }) => {
  const password = process.env.GT_PW_RAYMON
  test.skip(!password || !process.env.GT_UI_URL?.includes(':8200'), 'needs a Vault URL and the password')
  await page.goto('/ui/vault/auth?with=oidc%2F')
  await page.locator('[name="role"]').fill('default').catch(() => {})
  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: /Sign in with OIDC Provider|Sign in/ }).click()
  const popup = await popupPromise
  await popup.locator('#username').fill('raymon')
  await popup.locator('#password').fill(password!)
  await popup.locator('#kc-login').click()
  await page.waitForURL(/\/ui\/vault\/dashboard/, { timeout: 30_000 })
  // Admin capabilities are visible, and the user menu names the person.
  await expect(page.getByRole('link', { name: 'Raft storage' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'User menu' }).click()
  await expect(page.getByText(/raymon/i).first()).toBeVisible()
  if (process.env.GT_SHOTS_DIR) await page.screenshot({ path: `${process.env.GT_SHOTS_DIR}/vault-ui-oidc.png` })
})
