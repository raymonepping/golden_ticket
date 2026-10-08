<script setup lang="ts">
import type { PostureKind } from '../../shared/types'

defineProps<{ kind: PostureKind }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <!-- provisioned: a box Terraform built -->
    <template v-if="kind === 'provisioned'"><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></template>
    <!-- rhel: the guest OS -->
    <template v-else-if="kind === 'rhel'"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></template>
    <!-- ansible: converge loop -->
    <template v-else-if="kind === 'ansible'"><path d="M20 11a8 8 0 0 0-14.3-4.9M4 13a8 8 0 0 0 14.3 4.9" /><path d="M4 4v4h4M20 20v-4h-4" /></template>
    <!-- service: activity pulse -->
    <template v-else-if="kind === 'service'"><path d="M3 12h4l3-8 4 16 3-8h4" /></template>
    <!-- vault: lock -->
    <template v-else><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2" /></template>
  </svg>
</template>
