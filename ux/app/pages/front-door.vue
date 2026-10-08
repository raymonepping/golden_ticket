<script setup lang="ts">
useHead({ title: 'Front door · golden_ticket' })
const { plane, checking, refresh } = usePlaneLive()
const door = computed(() => plane.value?.frontDoor ?? null)
const allUp = computed(() => door.value?.entries.every(entry => entry.servers.some(server => server.status === 'UP')) ?? false)
</script>

<template>
  <div>
    <section class="vg-hero fleet-hero" aria-labelledby="door-title">
      <div class="hero-head">
        <div>
          <p class="eyebrow">HAProxy · TLS in, verified TLS out</p>
          <h1 id="door-title">Front door</h1>
          <p>One TLS entry point{{ door ? ` on ${door.node}` : '' }}. Traffic is re-encrypted to each backend and verified against the lab CA; Vault writes always reach the active node.</p>
        </div>
        <button class="secondary-button" type="button" :disabled="checking" @click="refresh()">
          <svg class="button-icon" :class="{ spinning: checking }" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v5h-5" /></svg>
          {{ checking ? 'Checking…' : 'Refresh' }}
        </button>
      </div>
      <p v-if="door" class="hero-status" :class="{ attention: !allUp }" role="status">
        {{ door.entries.length }} entry points · {{ allUp ? 'every entry has a healthy backend' : 'an entry has no healthy backend' }}
      </p>
    </section>

    <div v-if="!plane" class="skeleton" aria-label="Loading"><div /></div>
    <FrontDoorPanel v-else-if="door" :door="door" title="Entry points" />
    <section v-else class="empty vg-glass">
      <h2>No front door yet</h2>
      <p>The lab has no gt-proxy-1. Run make lab with the proxy node in group_vars.</p>
    </section>
  </div>
</template>
