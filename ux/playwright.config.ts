import { defineConfig } from '@playwright/test'

// Runs against an already-running control plane (make ui / make ui-start).
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: process.env.GT_UI_URL || 'http://127.0.0.1:3310',
    // The VM serves a lab-CA certificate Chromium does not know. TLS is
    // verified separately (curl --cacert, validate.yml); the scan is about UI.
    ignoreHTTPSErrors: true,
  },
})
