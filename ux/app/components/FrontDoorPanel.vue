<script setup lang="ts">
import type { FrontDoor } from '../../shared/types'

withDefaults(defineProps<{ door: FrontDoor, title?: string }>(), { title: 'Front door' })
const tone = (status: string) => status === 'UP' ? 'state-pass' : status === 'DOWN' ? 'state-fail' : 'state-unknown'
const label = (status: string) => ({ UP: 'up', STANDBY: 'standby', DOWN: 'down', MAINT: 'maintenance' } as Record<string, string>)[status] ?? 'unknown'
</script>

<template>
  <section class="panel vg-glass" aria-labelledby="front-door-title">
    <div class="panel-head">
      <div>
        <h2 id="front-door-title">{{ title }}</h2>
        <p>One TLS entry point on <span class="mono">{{ door.node }}</span>. Traffic is re-encrypted to each backend and verified against the lab CA.</p>
      </div>
      <span class="source-tag">live HAProxy stats</span>
    </div>
    <div class="door-list">
      <div v-for="entry in door.entries" :key="entry.key" class="door-row">
        <div class="door-name">
          <strong>{{ entry.label }}</strong>
          <a class="mono" :href="entry.url" target="_blank" rel="noopener noreferrer">{{ entry.url }}</a>
        </div>
        <div class="door-servers">
          <span v-for="server in entry.servers" :key="server.name" class="door-chip" :class="tone(server.status)">
            <i aria-hidden="true" />{{ server.name }}<span v-if="server.status === 'STANDBY'" class="door-note">standby</span><span class="sr-only"> {{ label(server.status) }}</span>
          </span>
          <span v-if="!entry.servers.length" class="door-chip state-unknown">no evidence</span>
        </div>
      </div>
    </div>
  </section>
</template>
