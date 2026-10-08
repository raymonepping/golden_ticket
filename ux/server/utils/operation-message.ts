import type { InstanceAction, InstanceSummary } from '../../shared/types'

/**
 * Report command success separately from readiness: a zero exit status from
 * Multipass never means the node is ready. The seal chain makes restarts
 * role-dependent, so say what actually happened.
 */
export function operationMessage(action: InstanceAction, instance: InstanceSummary | null): string {
  if (!instance) return `${action} finished; the instance is no longer listed.`
  const vault = instance.posture.vault.status
  if (!['start', 'restart'].includes(action) || !instance.labRole) return `${action} finished; posture was refreshed.`
  if (instance.labRole === 'seal') {
    return vault === 'Secured'
      ? `${action} finished; the seal Vault is unsealed.`
      : `${action} finished. The seal Vault starts sealed — run make unseal; cluster nodes keep serving meanwhile.`
  }
  return vault === 'Secured'
    ? `${action} finished; ${instance.name} auto-unsealed through the seal Vault.`
    : `${action} finished; ${instance.name} is ${vault.toLowerCase()} — it unseals itself once it can reach an unsealed seal Vault.`
}
