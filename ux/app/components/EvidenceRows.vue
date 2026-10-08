<script setup lang="ts">
import type { EvidenceCheck } from '../../shared/types'

defineProps<{ items: EvidenceCheck[], showMeta?: boolean }>()

const mark = (status: EvidenceCheck['status']) => ({ pass: '✓', fail: '×', warn: '!', unknown: '?' })[status]
const time = (value: string) => new Date(value).toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' })
</script>

<template>
  <div class="evidence-list">
    <article v-for="item in items" :key="item.id" class="evidence-row">
      <span class="mark" :class="`state-${item.status}`" :aria-label="item.status">{{ mark(item.status) }}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-3">
          <h3>{{ item.label }}</h3>
          <span class="scope-chip">{{ item.scope }}</span>
        </div>
        <p>{{ item.detail }}</p>
        <span v-if="showMeta" class="meta">{{ item.source }} · observed {{ time(item.observedAt) }}</span>
      </div>
    </article>
  </div>
</template>
