import { expect, type Page } from '@playwright/test'

/** Sign in through Keycloak (password from GT_PW_<UID>, never stored). */
export async function signIn(page: Page, uid: string): Promise<void> {
  const password = process.env[`GT_PW_${uid.toUpperCase()}`]
  if (!password) throw new Error(`GT_PW_${uid.toUpperCase()} is not set (use scripts/ui-signin-test.sh)`)
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
  await page.getByRole('link', { name: 'Continue with Keycloak' }).click()
  await page.locator('#username').fill(uid)
  await page.locator('#password').fill(password)
  await page.locator('#kc-login').click()
  await page.waitForURL(url => !url.href.includes('/realms/'))
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.waitForSelector('.persona')
}

/** Sign in as the admin when the console requires a session. */
export async function signInIfRequired(page: Page): Promise<void> {
  const session = await (await page.request.get('/api/session')).json() as { authEnabled: boolean, authRequired: boolean }
  if (session.authEnabled || session.authRequired) await signIn(page, 'raymon')
}
