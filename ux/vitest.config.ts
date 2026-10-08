import { defineConfig } from 'vitest/config'

// Unit tests only; e2e/ holds the Playwright a11y + screenshot suite.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } })
