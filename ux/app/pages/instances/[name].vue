<script setup lang="ts">
import type { PostureCategory } from '../../../shared/types'
import { ROLE_DESCRIPTIONS, isVaultRole } from '#shared/posture'

const route = useRoute()
const name = computed(() => String(route.params.name))
useHead({ title: () => `${name.value} · golden_ticket` })
const config = useRuntimeConfig()
const { plane, checking, refresh } = usePlane()
const selectedEvidence = ref<PostureCategory | null>(null)
const { selectedAction, selectedInstance, pending, toast, requestAction, closeAction, confirmAction } = useOperations(() => refresh())

const instance = computed(() => plane.value?.instances.find(item => item.name === name.value) || null)
const state = computed(() => instance.value?.state.toLowerCase() || '')
const gb = (bytes: number | null | undefined) => bytes == null ? 'Unavailable' : `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`
const verbs: Record<string, string> = { provisioned: 'Terraform builds it', rhel: 'RHEL runs it', ansible: 'Ansible decorates it', vault: 'Vault secures it', service: 'its service answers' }
const roleLabel = computed(() => instance.value?.labRole ? ROLE_DESCRIPTIONS[instance.value.labRole] : 'Not a golden_ticket node')
const observeOnly = computed(() => plane.value?.mode === 'vm')
const { can } = useAuth()
const canOperate = can('operator')
const canAdmin = can('admin')
const vaultNode = computed(() => isVaultRole(instance.value?.labRole))
const nodeVault = computed(() => instance.value?.posture.vault.evidence.filter(item => item.scope === 'node') || [])
const scoped = computed(() => instance.value?.posture.vault.evidence.filter(item => item.scope !== 'node') || [])

let timer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  if (!plane.value) await refresh(false)
  void refresh()
  timer = setInterval(() => refresh(), Number(config.public.refreshSeconds) * 1000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div>
    <NuxtLink to="/machines" class="back-link"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m10 3-5 5 5 5" /></svg> Virtual machines</NuxtLink>

    <div v-if="!plane" class="skeleton" aria-label="Loading"><div /><div /></div>
    <section v-else-if="!instance" class="notice-panel vg-glass is-error" role="alert">
      <div class="grow"><h2>Instance unavailable</h2><p>{{ plane.available ? `${name} is not in the latest Multipass list.` : plane.message }}</p></div>
      <NuxtLink to="/" class="secondary-button">Back to fleet</NuxtLink>
    </section>

    <template v-else>
      <section class="vg-hero detail-hero" aria-labelledby="instance-title">
        <div class="hero-head">
          <div class="detail-identity">
            <p class="eyebrow">{{ roleLabel }}</p>
            <h1 id="instance-title">{{ instance.name }}</h1>
            <p>{{ instance.release || 'Operating system unavailable' }} · <span class="mono">{{ instance.ipv4[0] || 'no IPv4' }}</span> · {{ instance.state }}</p>
          </div>
          <div v-if="!observeOnly && canOperate" class="detail-actions">
            <button v-if="state === 'running'" class="secondary-button" type="button" :disabled="pending" @click="requestAction('restart', instance)">Restart</button>
            <button v-if="state === 'running'" class="secondary-button" type="button" :disabled="pending" @click="requestAction('stop', instance)">Stop</button>
            <button v-else-if="instance.deleted && canAdmin" class="secondary-button" type="button" :disabled="pending" @click="requestAction('recover', instance)">Recover</button>
            <button v-else class="secondary-button" type="button" :disabled="pending" @click="requestAction('start', instance)">Start</button>
            <button v-if="!instance.deleted && canAdmin" class="secondary-button" type="button" :disabled="pending" @click="requestAction('delete', instance)">Move to trash</button>
          </div>
        </div>
        <div class="lifecycle">
          <div v-for="item in instance.posture" :key="item.kind" class="step">
            <PosturePill :category="item" large @select="selectedEvidence = $event" />
            <span class="verb">{{ verbs[item.kind] }}</span>
          </div>
        </div>
      </section>

      <div class="detail-grid">
        <section class="panel vg-glass">
          <div class="panel-head"><div><h2>Resources</h2><p>{{ observeOnly ? 'From Terraform lab_nodes and the guest probe.' : 'Live from Multipass.' }}</p></div><span class="source-tag">{{ observeOnly ? 'terraform + probe' : 'multipass info' }}</span></div>
          <dl class="data-list">
            <div><dt>{{ observeOnly ? 'Reachability' : 'State' }}</dt><dd>{{ instance.state }}</dd></div>
            <div><dt>IPv4</dt><dd class="mono">{{ instance.ipv4.join(', ') || 'Unavailable' }}</dd></div>
            <div><dt>CPU</dt><dd>{{ instance.resources.cpus ?? 'Unavailable' }}</dd></div>
            <div><dt>Memory</dt><dd>{{ gb(instance.resources.memoryBytes) }}</dd></div>
            <div><dt>Disk</dt><dd>{{ gb(instance.resources.diskBytes) }}</dd></div>
            <div><dt>Snapshots</dt><dd>{{ instance.snapshotCount ?? 'Unavailable' }}</dd></div>
          </dl>
        </section>

        <section class="panel vg-glass">
          <div class="panel-head"><div><h2>Ownership and convergence</h2><p>What Terraform built and Ansible converged.</p></div><span class="source-tag">terraform + .build/</span></div>
          <EvidenceRows :items="[...instance.posture.provisioned.evidence, ...instance.posture.ansible.evidence]" />
        </section>

        <section class="panel vg-glass">
          <div class="panel-head"><div><h2>{{ vaultNode ? 'Vault on this node' : 'Service on this node' }}</h2><p>Live read-only probe.</p></div><span class="source-tag">{{ checking ? 'checking…' : 'node scope' }}</span></div>
          <EvidenceRows v-if="nodeVault.length" :items="nodeVault" />
          <EvidenceRows v-else :items="instance.posture.vault.evidence" />
        </section>

        <section v-if="vaultNode" class="panel vg-glass">
          <div class="panel-head"><div><h2>{{ instance.labRole === 'seal' ? 'Seal chain' : 'Cluster and seal chain' }}</h2><p>From the last make validate, with its age.</p></div><span class="source-tag">.build/validation.json</span></div>
          <EvidenceRows v-if="scoped.length" :items="scoped" />
          <p v-else class="chain-hint">Cluster evidence is shown only for running golden_ticket nodes.</p>
        </section>
      </div>
    </template>

    <EvidencePanel :category="selectedEvidence" @close="selectedEvidence = null" />
    <ActionDialog :action="selectedAction" :instance="selectedInstance" :pending="pending" @close="closeAction" @confirm="confirmAction" />
    <Transition name="fade"><div v-if="toast" class="toast" :class="toast.type" role="status">{{ toast.message }}</div></Transition>
  </div>
</template>
