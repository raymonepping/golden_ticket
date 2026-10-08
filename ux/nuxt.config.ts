import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-05',
  devtools: { enabled: false },
  modules: ['@nuxt/eslint'],
  css: ['~/assets/css/main.css', '~/assets/css/golden-ticket.css'],
  vite: { plugins: [tailwindcss()] },
  typescript: { strict: true, typeCheck: true },
  runtimeConfig: {
    repositoryRoot: process.env.GT_REPOSITORY_ROOT || '..',
    public: {
      refreshSeconds: 15,
    },
  },
  nitro: {
    routeRules: {
      '/api/**': { headers: { 'cache-control': 'no-store' } },
    },
  },
  app: {
    head: {
      title: 'golden_ticket',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'Local posture and control for the Ansible-built Vault Enterprise lab on Multipass RHEL.' },
        { name: 'color-scheme', content: 'light' },
        { name: 'theme-color', content: '#e9eef3' },
      ],
    },
  },
})
