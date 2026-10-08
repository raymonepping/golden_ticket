<script setup lang="ts">
import type { InstanceSummary } from '../../shared/types'

const props = defineProps<{ action: string | null, instance: InstanceSummary | null, pending?: boolean }>()
const emit = defineEmits<{ close: [], confirm: [acknowledgeDrift: boolean] }>()
const acknowledgement = ref(false)
const owned = computed(() => props.instance?.labRole != null)
const ownedDelete = computed(() => props.action === 'delete' && owned.value)
const destructive = computed(() => props.action === 'delete')
const sealRestart = computed(() => props.instance?.labRole === 'seal' && ['stop', 'restart', 'suspend'].includes(props.action || ''))
const clusterRestart = computed(() => ['leader', 'follower'].includes(props.instance?.labRole || '') && ['restart', 'start'].includes(props.action || ''))

watch(() => props.action, () => { acknowledgement.value = false })
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="action && instance" class="dialog-layer" role="presentation" @click.self="emit('close')">
        <section class="dialog" role="dialog" aria-modal="true" :aria-labelledby="'action-title'">
          <p class="eyebrow">Confirm operation</p>
          <h2 id="action-title">{{ action.charAt(0).toUpperCase() + action.slice(1) }} <span class="mono">{{ instance.name }}</span>?</h2>
          <p v-if="destructive">The instance moves to Multipass trash and stays recoverable until purge.</p>
          <p v-else>Multipass runs the operation; every posture indicator is re-checked afterwards. A zero exit status is not readiness.</p>

          <div v-if="sealRestart" class="callout warn">
            <strong>This is the seal Vault</strong>
            <p>It comes back sealed. The cluster keeps serving, but any cluster node that restarts meanwhile waits until you run <code>make unseal</code>.</p>
          </div>
          <div v-else-if="clusterRestart" class="callout info">
            <strong>Auto-unseal</strong>
            <p>The node unseals itself through the seal Vault's Transit key once it boots — no keys needed.</p>
          </div>

          <div v-if="ownedDelete" class="callout warn">
            <strong>Terraform ownership boundary</strong>
            <p>This VM is managed by Terraform (<code>terraform/infra</code>). Deleting it directly creates drift: the next <code>make infra</code> recreates it, and <code>make lab</code> furnishes it again from scratch.</p>
            <label><input v-model="acknowledgement" type="checkbox"> I understand this creates ownership drift.</label>
          </div>

          <div class="dialog-actions">
            <button class="secondary-button" type="button" :disabled="pending" @click="emit('close')">Cancel</button>
            <button :class="destructive ? 'destructive-button' : 'primary-button'" type="button" :disabled="pending || (ownedDelete && !acknowledgement)" @click="emit('confirm', acknowledgement)">
              <svg v-if="pending" class="button-icon spinning" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 10a7 7 0 1 1-2-4.9" /></svg>
              {{ pending ? 'Working…' : `Confirm ${action}` }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
