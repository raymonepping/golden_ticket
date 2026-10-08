<script setup lang="ts">
useHead({ title: 'Sign in · golden_ticket' })
const route = useRoute()
const { load, session } = useAuth()
const error = computed(() => typeof route.query.error === 'string' ? route.query.error : null)
onMounted(async () => {
  const value = await load(true)
  if (value.authenticated) await navigateTo('/')
})
</script>

<template>
  <div class="signin-page">
    <main id="main" class="signin-ground">
      <section class="vg-hero signin-card" aria-labelledby="signin-title">
        <svg class="signin-mark" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path d="M8 15.5V8.5h4.2a2.4 2.4 0 0 1 0 4.8H8m4.6 0 2.9 2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <p class="eyebrow">golden_ticket control plane</p>
        <h1 id="signin-title">Sign in</h1>
        <p>Your identity comes from the lab directory through Keycloak. What you may do here follows your group: viewers observe, operators restart, administrators manage.</p>
        <p v-if="error" class="signin-error" role="alert">{{ error }}</p>
        <p v-else-if="session && session.authRequired && !session.authEnabled" class="signin-error" role="alert">Sign-in is required but identity is not configured on this console yet.</p>
        <a v-if="!session || session.authEnabled" class="primary-button signin-button" href="/auth/login">Continue with Keycloak</a>
      </section>
    </main>
    <GoldenTicketFooter />
  </div>
</template>

<style scoped>
.signin-page { display: flex; flex-direction: column; min-height: 100vh; }
.signin-ground { flex: 1; display: grid; place-items: center; padding: 16px; }
.signin-card { width: min(440px, 100%); display: grid; gap: 10px; padding: 28px; }
.signin-card h1 { margin: 0; font-size: 26px; font-weight: 780; letter-spacing: -0.02em; }
.signin-card p { margin: 0; font-size: 13px; color: var(--vg-text-secondary); }
.signin-mark { width: 34px; height: 34px; color: var(--vg-action-bright); }
.signin-error { padding: 10px 12px; border-radius: 8px; background: var(--vg-critical-bg); color: var(--vg-critical) !important; }
.signin-button { justify-content: center; margin-top: 6px; background: #f3f6f9; color: #0f1a2a; }
.signin-button:hover { background: #ffffff; color: #0f1a2a; }
</style>
