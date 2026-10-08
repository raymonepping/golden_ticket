<script setup lang="ts">
import type { PostureCategory } from '../../shared/types'
import { isVaultRole } from '#shared/posture'
import { paneNeedsAttention, paneSummaryLine } from '#shared/vm-pane'

useHead({ title: 'Virtual machines · golden_ticket' })
const { plane, checking, failed, refresh } = usePlaneLive()
const selectedEvidence = ref<PostureCategory | null>(null)
const purgeOpen = ref(false)
const purgePending = ref(false)
const { selectedAction, selectedInstance, pending, toast, requestAction, closeAction, confirmAction } = useOperations(() => refresh())
const { can } = useAuth()
const canAdmin = can('admin')

const ordered = computed(() => [...(plane.value?.instances || [])].sort((a, b) => {
  const rank = (role: string | null) => role === 'seal' ? 0 : isVaultRole(role) ? 1 : role ? 2 : 3
  return rank(a.labRole) - rank(b.labRole) || a.name.localeCompare(b.name)
}))
const observeOnly = computed(() => plane.value?.mode === 'vm')
const needsAttention = computed(() => paneNeedsAttention(ordered.value))
const summaryLine = computed(() => paneSummaryLine(ordered.value, observeOnly.value))

async function purge(confirmation: string) {
  purgePending.value = true
  try {
    const result = await $fetch<{ message: string }>('/api/purge', { method: 'POST', body: { confirmation } })
    toast.value = { type: 'success', message: result.message }
    purgeOpen.value = false
    await refresh()
  } catch (err) {
    const response = err as { data?: { statusMessage?: string } }
    toast.value = { type: 'error', message: response.data?.statusMessage || 'Purge failed.' }
  } finally {
    purgePending.value = false
  }
}
</script>

<template>
  <div>
    <section class="vg-hero fleet-hero" aria-labelledby="machines-title">
      <div class="hero-head">
        <div>
          <p class="eyebrow">Multipass · four indicators per VM</p>
          <h1 id="machines-title">Virtual machines</h1>
          <p>Every VM Multipass knows about, golden_ticket or not. Open any indicator to see the evidence behind it.</p>
        </div>
        <button class="secondary-button" type="button" :disabled="checking" @click="refresh()">
          <svg class="button-icon" :class="{ spinning: checking }" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v5h-5" /></svg>
          {{ checking ? 'Checking…' : 'Refresh' }}
        </button>
      </div>
      <p v-if="plane?.available" class="hero-status" :class="{ attention: needsAttention }" role="status">{{ summaryLine }}</p>
    </section>

    <section v-if="(plane && !plane.available) || (failed && !plane)" class="notice-panel vg-glass is-error" role="alert">
      <div class="grow"><h2>Inventory unavailable</h2><p>{{ plane?.message || 'The local API did not answer.' }}</p></div>
      <button class="secondary-button" type="button" @click="refresh()">Try again</button>
    </section>
    <div v-if="!plane" class="skeleton" aria-label="Loading instances"><div v-for="i in 4" :key="i" /></div>

    <VmListPane
      v-if="plane?.available"
      :foldable="false"
      :instances="ordered"
      :total="plane.summary.total"
      :running="plane.summary.running"
      :deleted="plane.summary.deleted"
      :observe-only="observeOnly"
      :checking="checking"
      :can-admin="canAdmin"
      @evidence="selectedEvidence = $event"
      @action="requestAction"
      @purge="purgeOpen = true"
    />

    <EvidencePanel :category="selectedEvidence" @close="selectedEvidence = null" />
    <ActionDialog :action="selectedAction" :instance="selectedInstance" :pending="pending" @close="closeAction" @confirm="confirmAction" />
    <PurgeDialog :open="purgeOpen" :pending="purgePending" @close="purgeOpen = false" @confirm="purge" />
    <Transition name="fade"><div v-if="toast" class="toast" :class="toast.type" role="status">{{ toast.message }}</div></Transition>
  </div>
</template>
