<script setup lang="ts">
import type { InstanceSummary, PostureCategory } from '../../shared/types'
import { ROLE_LABELS, isVaultRole } from '#shared/posture'

const props = defineProps<{ instance: InstanceSummary, busy?: boolean, observeOnly?: boolean }>()
const emit = defineEmits<{ evidence: [category: PostureCategory], action: [action: string, instance: InstanceSummary] }>()
const menuOpen = ref(false)
const { can } = useAuth()
const canOperate = can('operator')
const canAdmin = can('admin')

const gb = (bytes: number | null) => bytes === null ? '—' : `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`
const state = computed(() => props.instance.state.toLowerCase())
const roleLabel = computed(() => props.instance.labRole ? ROLE_LABELS[props.instance.labRole] : 'Not golden_ticket')
const roleClass = computed(() => !props.instance.labRole ? 'foreign' : props.instance.labRole === 'seal' ? 'seal' : isVaultRole(props.instance.labRole) ? '' : 'service')
function act(action: string) {
  menuOpen.value = false
  emit('action', action, props.instance)
}
</script>

<template>
  <article class="instance-card vg-glass" :class="{ 'is-foreign': !instance.labRole }">
    <div class="card-head">
      <NuxtLink :to="`/instances/${encodeURIComponent(instance.name)}`" class="card-name">
        <strong>{{ instance.name }}</strong>
        <small>{{ instance.release || 'Operating system unavailable' }}</small>
      </NuxtLink>
      <span class="state-chip" :class="{ running: state === 'running' || state === 'reachable', deleted: instance.deleted || state === 'unreachable' }"><i />{{ instance.state }}</span>
    </div>

    <div class="card-meta">
      <span class="role-chip" :class="roleClass">{{ roleLabel }}</span>
      <span class="mono">{{ instance.ipv4[0] || 'no IPv4' }}</span>
    </div>

    <div class="posture-flow">
      <PosturePill v-for="item in instance.posture" :key="item.kind" :category="item" @select="emit('evidence', $event)" />
    </div>

    <div class="resource-row">
      <span><b>{{ instance.resources.cpus ?? '—' }}</b> CPU</span>
      <span><b>{{ gb(instance.resources.memoryBytes) }}</b> memory</span>
      <span><b>{{ gb(instance.resources.diskBytes) }}</b> disk</span>
    </div>

    <div v-if="!observeOnly && canOperate" class="card-actions">
      <button v-if="state === 'stopped' || state === 'suspended'" class="primary-button" type="button" :disabled="busy" @click="act('start')">Start</button>
      <button v-else-if="state === 'running'" class="secondary-button" type="button" :disabled="busy" @click="act('restart')">Restart</button>
      <button v-else-if="instance.deleted && canAdmin" class="primary-button" type="button" :disabled="busy" @click="act('recover')">Recover</button>
      <div v-if="!instance.deleted" class="menu-wrap">
        <button class="icon-button" type="button" :disabled="busy" :aria-expanded="menuOpen" :aria-label="`More actions for ${instance.name}`" @click="menuOpen = !menuOpen">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="16" cy="10" r="1.4" /></svg>
        </button>
        <div v-if="menuOpen" class="menu" role="menu" @mouseleave="menuOpen = false">
          <button v-if="state === 'running'" role="menuitem" type="button" @click="act('stop')">Stop</button>
          <button v-if="state === 'running'" role="menuitem" type="button" @click="act('suspend')">Suspend</button>
          <button v-if="canAdmin" class="danger" role="menuitem" type="button" @click="act('delete')">Move to trash</button>
        </div>
      </div>
    </div>
  </article>
</template>
