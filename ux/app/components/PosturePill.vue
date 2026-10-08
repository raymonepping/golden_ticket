<script setup lang="ts">
import type { PostureCategory } from '../../shared/types'

defineProps<{ category: PostureCategory, large?: boolean }>()
defineEmits<{ select: [category: PostureCategory] }>()

const stateClass = (tone: PostureCategory['tone']) => ({ positive: 'state-pass', warning: 'state-warn', critical: 'state-fail', neutral: 'state-unknown' })[tone]
</script>

<template>
  <button
    type="button"
    class="posture-pill"
    :class="[`tone-${category.tone}`, { large }]"
    :aria-label="`${category.label}: ${category.status}. Show evidence.`"
    @click.stop="$emit('select', category)"
  >
    <span class="glyph" :class="stateClass(category.tone)"><PostureGlyph :kind="category.kind" /></span>
    <span class="copy">
      <span class="kind">{{ category.label }}</span>
      <span class="value">{{ category.status }}</span>
    </span>
  </button>
</template>
