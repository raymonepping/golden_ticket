<script setup lang="ts">
defineProps<{ open: boolean, pending?: boolean }>()
const emit = defineEmits<{ close: [], confirm: [phrase: string] }>()
const phrase = ref('')
const required = 'PURGE DELETED INSTANCES'
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="dialog-layer" role="presentation" @click.self="emit('close')">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="purge-title">
          <p class="eyebrow">Permanent operation</p>
          <h2 id="purge-title">Purge deleted instances?</h2>
          <p>This permanently removes every instance in Multipass trash, including VMs from other projects. It cannot be undone.</p>
          <label class="phrase">Type <strong class="mono">{{ required }}</strong> to confirm
            <input v-model="phrase" autocomplete="off" spellcheck="false" aria-label="Confirmation phrase">
          </label>
          <div class="dialog-actions">
            <button class="secondary-button" type="button" :disabled="pending" @click="emit('close')">Cancel</button>
            <button class="destructive-button" type="button" :disabled="pending || phrase !== required" @click="emit('confirm', phrase)">Purge permanently</button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
