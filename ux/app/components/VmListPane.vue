<script setup lang="ts">
import type { InstanceSummary, PostureCategory } from '../../shared/types'
import { paneNeedsAttention, paneSummaryLine } from '#shared/vm-pane'

const props = withDefaults(defineProps<{
  /** false on the Virtual machines page: always open, no fold header. */
  foldable?: boolean
  instances: InstanceSummary[]
  total: number
  running: number
  deleted: number
  observeOnly: boolean
  checking: boolean
  canAdmin: boolean
}>(), { foldable: true })

const emit = defineEmits<{
  evidence: [PostureCategory]
  action: [action: string, instance: InstanceSummary]
  purge: []
}>()

// ── Fold state (localStorage-remembered, never required to render) ──────────
const open = ref(false)
onMounted(() => {
  try { open.value = localStorage.getItem('golden-ticket:vm-pane') === '1' } catch { /* stays folded */ }
})
function toggle() {
  open.value = !open.value
  try { localStorage.setItem('golden-ticket:vm-pane', open.value ? '1' : '0') } catch { /* ignore */ }
}

// ── Filter ──────────────────────────────────────────────────────────────────
const filter = ref<'instances' | 'trash'>('instances')

// ── Computed summary text ────────────────────────────────────────────────────
const needsAttention = computed(() => paneNeedsAttention(props.instances))
const summaryLine = computed(() => paneSummaryLine(props.instances, props.observeOnly))
const shown = computed(() => !props.foldable || open.value)

const visible = computed(() =>
  props.instances.filter(i => filter.value === 'trash' ? i.deleted : !i.deleted),
)
</script>

<template>
  <section class="vm-pane" :class="{ 'vg-glass': foldable, 'vm-pane--attention': foldable && needsAttention, 'vm-pane--flat': !foldable }" :aria-labelledby="foldable ? 'vm-pane-title' : undefined" :aria-label="foldable ? undefined : 'Virtual machines'">
    <!-- ── Pane header (always visible) ──────────────────────────────────── -->
    <button
      v-if="foldable"
      type="button"
      class="vm-pane__header"
      :aria-expanded="open"
      aria-controls="vm-pane-body"
      @click="toggle"
    >
      <span class="vm-pane__title-group">
        <span id="vm-pane-title" class="vm-pane__title">Virtual machines</span>
        <span class="vm-pane__summary" :class="{ 'vm-pane__summary--warn': needsAttention }">{{ summaryLine }}</span>
      </span>
      <svg
        class="vm-pane__chevron"
        :class="{ 'vm-pane__chevron--open': open }"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 4.5 6 7.5 9 4.5" />
      </svg>
    </button>

    <!-- ── Pane body (visible when open) ─────────────────────────────────── -->
    <div v-show="shown" id="vm-pane-body" :class="{ 'vm-pane__body--flat': !foldable }">
      <div v-if="!observeOnly" class="toolbar">
        <div class="segmented" role="tablist" aria-label="Instance list">
          <button type="button" role="tab" :aria-selected="filter === 'instances'" :class="{ active: filter === 'instances' }" @click="filter = 'instances'">
            Instances <span>{{ total - deleted }}</span>
          </button>
          <button type="button" role="tab" :aria-selected="filter === 'trash'" :class="{ active: filter === 'trash' }" @click="filter = 'trash'">
            Trash <span>{{ deleted }}</span>
          </button>
        </div>
        <button v-if="filter === 'trash' && deleted && canAdmin" class="text-danger" type="button" @click="emit('purge')">
          Purge trash…
        </button>
      </div>

      <div v-if="visible.length" class="instance-grid">
        <InstanceCard
          v-for="instance in visible"
          :key="instance.name"
          :instance="instance"
          :busy="checking"
          :observe-only="observeOnly"
          @evidence="emit('evidence', $event)"
          @action="(action, instance) => emit('action', action, instance)"
        />
      </div>
      <div v-else class="empty vg-glass">
        <h2>{{ filter === 'trash' ? 'Trash is empty' : 'No instances' }}</h2>
        <p>{{ filter === 'trash' ? 'Deleted instances stay recoverable here until purged.' : 'Run make lab to launch the golden_ticket VMs, then refresh.' }}</p>
      </div>
    </div>
  </section>
</template>
