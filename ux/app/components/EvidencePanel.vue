<script setup lang="ts">
import type { PostureCategory } from '../../shared/types'

const props = defineProps<{ category: PostureCategory | null }>()
const emit = defineEmits<{ close: [] }>()

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.category) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade"><div v-if="category" class="scrim" @click="emit('close')" /></Transition>
    <Transition name="slide">
      <aside v-if="category" class="drawer" role="dialog" aria-modal="true" :aria-label="`${category.label} evidence`">
        <div class="drawer-head">
          <div>
            <p class="eyebrow">Posture evidence</p>
            <h2>{{ category.label }} <span>· {{ category.status }}</span></h2>
          </div>
          <button class="icon-button" type="button" aria-label="Close evidence" @click="emit('close')">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </div>
        <div class="drawer-body" tabindex="0" aria-label="Evidence checks">
          <p>The result is derived only from the checks below. Unknown evidence never counts as passing; cluster and seal-chain checks come from the last <code class="mono">make validate</code>.</p>
          <EvidenceRows :items="category.evidence" show-meta />
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>
