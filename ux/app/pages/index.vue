<script setup lang="ts">
import { isVaultRole } from '#shared/posture'
import { paneNeedsAttention, paneSummaryLine } from '#shared/vm-pane'

useHead({ title: 'Fleet · golden_ticket' })
const { plane, checking, failed, refresh } = usePlaneLive()

const ordered = computed(() => [...(plane.value?.instances || [])].sort((a, b) => a.name.localeCompare(b.name)))
const observeOnly = computed(() => plane.value?.mode === 'vm')
const lab = computed(() => ordered.value.filter(item => item.labRole && !item.deleted))
const vaultNodes = computed(() => lab.value.filter(item => isVaultRole(item.labRole)))
const secured = computed(() => vaultNodes.value.filter(item => item.posture.vault.status === 'Secured').length)
const voters = computed(() => plane.value?.cluster.find(item => item.id === 'report-cluster-raft_voters'))
const observed = computed(() => plane.value?.observedAt ? new Date(plane.value.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—')
const needsAttention = computed(() => paneNeedsAttention(ordered.value))
const summaryLine = computed(() => paneSummaryLine(ordered.value, observeOnly.value))
</script>

<template>
  <div>
    <section class="vg-hero fleet-hero" aria-labelledby="fleet-title">
      <div class="hero-head">
        <div>
          <p class="eyebrow">Vault Enterprise · Multipass RHEL · Terraform + Ansible</p>
          <h1 id="fleet-title">Provisioned, converged, sealed by design</h1>
          <p>Terraform builds the RHEL VMs and the structure inside Vault; Ansible decorates them. Three Raft nodes auto-unseal through the seal agent. Every indicator below is backed by evidence you can open.</p>
          <p v-if="observeOnly"><strong>Observe-only:</strong> this console runs inside gt-ux-1 — lifecycle actions run from the host console.</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="observed"><span class="dot" :class="{ live: plane?.available && !failed }" /> Observed {{ observed }}</span>
          <button class="secondary-button" type="button" :disabled="checking" @click="refresh()">
            <svg class="button-icon" :class="{ spinning: checking }" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v5h-5" /></svg>
            {{ checking ? 'Checking…' : 'Refresh' }}
          </button>
        </div>
      </div>
      <div v-if="plane?.available" class="hero-tiles">
        <div class="vg-tile"><span class="vg-tile__label">golden_ticket nodes</span><span class="vg-tile__value">{{ lab.length }}</span><span class="vg-tile__sub">{{ observeOnly ? "from Terraform lab_nodes" : `${plane.summary.total} Multipass VMs in total` }}</span></div>
        <div class="vg-tile"><span class="vg-tile__label">Vault secured</span><span class="vg-tile__value" :class="secured === vaultNodes.length && vaultNodes.length ? 'is-good' : 'is-warn'">{{ secured }}<small>/ {{ vaultNodes.length }}</small></span><span class="vg-tile__sub">node and cluster evidence</span></div>
        <div class="vg-tile"><span class="vg-tile__label">Raft voters</span><span class="vg-tile__value" :class="voters?.status === 'pass' ? 'is-good' : 'is-warn'">{{ voters?.detail.replace(/\s/g, '') || '—' }}</span><span class="vg-tile__sub">from make validate</span></div>
        <div class="vg-tile"><span class="vg-tile__label">{{ observeOnly ? 'Reachable' : 'Running' }}</span><span class="vg-tile__value">{{ plane.summary.running }}</span><span class="vg-tile__sub">{{ observeOnly ? 'answering the probe' : `${plane.summary.stopped} stopped` }}</span></div>
        <div class="vg-tile"><span class="vg-tile__label">Compute</span><span class="vg-tile__value">{{ plane.summary.cpus }}<small>CPU</small></span><span class="vg-tile__sub">{{ (plane.summary.memoryBytes / 1024 ** 3).toFixed(0) }} GB memory</span></div>
      </div>
    </section>

    <section v-if="plane && !plane.available" class="notice-panel vg-glass is-error" role="alert">
      <div class="grow"><h2>Multipass unavailable</h2><p>{{ plane.message }}</p></div>
      <button class="secondary-button" type="button" @click="refresh()">Try again</button>
    </section>
    <section v-else-if="failed && !plane" class="notice-panel vg-glass is-error" role="alert">
      <div class="grow"><h2>Control plane unreachable</h2><p>The local API did not answer.</p></div>
      <button class="secondary-button" type="button" @click="refresh()">Try again</button>
    </section>

    <div v-if="!plane" class="skeleton" aria-label="Loading instances"><div v-for="i in 4" :key="i" /></div>

    <template v-if="plane?.available">
      <SealChainPanel :chain="plane.sealChain" :checking="checking" />
      <nav class="fleet-links" aria-label="More of the lab">
        <NuxtLink to="/machines" class="fleet-link vg-glass" :class="{ attention: needsAttention }">
          <strong>Virtual machines</strong>
          <span>{{ summaryLine }}</span>
        </NuxtLink>
        <NuxtLink v-if="plane.frontDoor" to="/front-door" class="fleet-link vg-glass">
          <strong>Front door</strong>
          <span>{{ plane.frontDoor.entries.length }} entry points on {{ plane.frontDoor.node }}</span>
        </NuxtLink>
      </nav>
    </template>

  </div>
</template>
