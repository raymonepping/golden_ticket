<script setup lang="ts">
import type { SealChain } from '../../shared/types'

defineProps<{ chain: SealChain | null, checking?: boolean }>()
const mark = (status: string) => ({ pass: '✓', fail: '×', warn: '!', unknown: '?' } as Record<string, string>)[status] ?? '?'
</script>

<template>
  <section class="panel vg-glass" aria-labelledby="seal-chain-title">
    <div class="panel-head">
      <div>
        <h2 id="seal-chain-title">Seal chain</h2>
        <p>The seal Vault's Transit key unseals every cluster node{{ chain?.agent ? ', through the seal agent — the nodes hold no seal credential' : '' }}. Only the seal Vault ever needs an operator key.</p>
      </div>
      <span class="source-tag">live sys/seal-status</span>
    </div>

    <p v-if="!chain" class="chain-hint">{{ checking ? 'Checking the seal chain…' : 'No golden_ticket seal Vault in Terraform lab_nodes.' }}</p>
    <template v-else>
      <div class="chain">
        <div class="chain-node" :class="`is-${chain.sealVault.status}`">
          <span class="chain-glyph" :class="`state-${chain.sealVault.status}`"><PostureGlyph kind="vault" /></span>
          <div>
            <NuxtLink :to="`/instances/${chain.sealNode}`"><strong class="mono">{{ chain.sealNode }}</strong></NuxtLink>
            <span>Shamir 1/1 · {{ chain.sealVault.detail }}</span>
          </div>
        </div>
        <template v-if="chain.agent">
          <div class="chain-wire" :class="`is-${chain.sealVault.status}`" aria-hidden="true" />
          <div class="chain-node" :class="`is-${chain.agent.status}`">
            <span class="chain-glyph" :class="`state-${chain.agent.status}`"><PostureGlyph kind="service" /></span>
            <div>
              <NuxtLink :to="`/instances/${chain.agent.node}`"><strong class="mono">{{ chain.agent.node }}</strong></NuxtLink>
              <span>Seal agent · {{ chain.agent.detail }}</span>
            </div>
          </div>
        </template>
        <div class="chain-wire" :class="`is-${chain.agent ? chain.agent.status : chain.sealVault.status}`" aria-hidden="true" />
        <div class="chain-links">
          <div v-for="link in chain.links" :key="link.node" class="chain-link" :class="`is-${link.status}`">
            <span class="chain-glyph" :class="`state-${link.status}`" :aria-label="link.status">{{ mark(link.status) }}</span>
            <div>
              <NuxtLink :to="`/instances/${link.node}`"><strong class="mono">{{ link.node }}</strong></NuxtLink>
              <span class="detail">{{ link.detail }}</span>
            </div>
          </div>
        </div>
      </div>
      <p v-if="chain.sealVault.status === 'fail'" class="chain-hint">The seal Vault is sealed. Cluster nodes that are already unsealed keep serving; restarted ones wait. Run <code>make unseal</code>.</p>
    </template>
  </section>
</template>
