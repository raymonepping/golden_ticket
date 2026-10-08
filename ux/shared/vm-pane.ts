import type { InstanceSummary, PostureCategory } from './types'

type ToneValue = PostureCategory['tone']

/** Up = Multipass "Running" (host mode) or probe-answered "Reachable" (VM mode). */
const isUp = (state: string | undefined) => ['running', 'reachable'].includes((state || '').toLowerCase())

/**
 * True when any non-deleted golden_ticket VM has a critical or warning indicator,
 * or is not up. Foreign VMs (not golden_ticket) never raise attention.
 */
export function paneNeedsAttention(instances: InstanceSummary[]): boolean {
  return instances.some((i) => {
    if (i.deleted || !i.labRole) return false
    const tones: ToneValue[] = Object.values(i.posture).map(p => p.tone)
    return tones.includes('critical') || tones.includes('warning') || !isUp(i.state)
  })
}

/** VMs that need a look, for the sidebar badge. */
export function attentionCount(instances: InstanceSummary[]): number {
  return instances.filter(i => !i.deleted && i.labRole && (
    !isUp(i.state) || Object.values(i.posture).some(p => p.tone === 'critical' || p.tone === 'warning'))).length
}

/**
 * Compact summary line: "<n> golden_ticket VMs · <n> running|reachable · <status> · <n> not golden_ticket".
 */
export function paneSummaryLine(instances: InstanceSummary[], observeOnly: boolean): string {
  const nonDeleted = instances.filter(i => !i.deleted)
  const lab = nonDeleted.filter(i => i.labRole)
  const foreignCount = nonDeleted.length - lab.length
  const up = lab.filter(i => isUp(i.state)).length

  const parts = [`${lab.length} golden_ticket VMs`, `${up} ${observeOnly ? 'reachable' : 'running'}`]
  if (paneNeedsAttention(instances)) {
    const hasFail = lab.some(i => !isUp(i.state) || Object.values(i.posture).some(p => p.tone === 'critical'))
    parts.push(hasFail ? 'needs attention' : 'check indicators')
  } else {
    parts.push(lab.length ? 'all green' : 'none provisioned')
  }
  if (foreignCount > 0) parts.push(`${foreignCount} not golden_ticket`)
  return parts.join(' · ')
}
