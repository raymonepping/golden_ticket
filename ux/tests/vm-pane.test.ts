import { describe, expect, it } from 'vitest'
import { attentionCount, paneNeedsAttention, paneSummaryLine } from '../shared/vm-pane'
import type { InstanceSummary, PostureCategory } from '../shared/types'

// Originally written by IBM Bob for prompt 10; reworked when the summary
// learned VM-mode states ("Reachable") and stopped counting foreign VMs.

function posture(tone: PostureCategory['tone']): PostureCategory {
  return { kind: 'vault', label: 'Vault', status: tone === 'positive' ? 'Secured' : 'Failed', tone, evidence: [] }
}

function instance(overrides: Partial<InstanceSummary> = {}, fourth: PostureCategory['tone'] = 'positive'): InstanceSummary {
  return {
    name: 'gt-vault-1', state: 'Running', ipv4: ['10.0.0.2'], release: 'RHEL 9.8', imageHash: null,
    resources: { cpus: 2, memoryBytes: 4294967296, diskBytes: null }, snapshotCount: null, deleted: false,
    labRole: 'leader',
    posture: { provisioned: posture('positive'), rhel: posture('positive'), ansible: posture('positive'), vault: posture(fourth) },
    ...overrides,
  }
}

const foreign = instance({ name: 'vault-1', state: 'Stopped', labRole: null }, 'neutral')

describe('fold/summary: all green', () => {
  it('reports all green in host mode', () => {
    expect(paneSummaryLine([instance(), instance({ name: 'gt-vault-2' })], false)).toBe('2 golden_ticket VMs · 2 running · all green')
  })
  it('counts probe-answered VMs as reachable in VM mode (regression: "0 reachable")', () => {
    const vm = [instance({ state: 'Reachable' }), instance({ name: 'gt-ux-1', state: 'Reachable', labRole: 'ux' })]
    expect(paneSummaryLine(vm, true)).toBe('2 golden_ticket VMs · 2 reachable · all green')
    expect(paneNeedsAttention(vm)).toBe(false)
  })
})

describe('fold/summary: attention', () => {
  it('flags an amber indicator as "check indicators"', () => {
    const list = [instance({}, 'warning')]
    expect(paneNeedsAttention(list)).toBe(true)
    expect(paneSummaryLine(list, false)).toContain('check indicators')
  })
  it('flags a red indicator or an unreachable node as "needs attention"', () => {
    expect(paneSummaryLine([instance({}, 'critical')], false)).toContain('needs attention')
    expect(paneSummaryLine([instance({ state: 'Unreachable' })], true)).toContain('needs attention')
  })
  it('counts VMs needing a look for the sidebar badge', () => {
    expect(attentionCount([instance(), instance({ name: 'b' }, 'warning'), instance({ name: 'c', state: 'Unreachable' })])).toBe(2)
  })
})

describe('fold/summary: foreign VMs', () => {
  it('never counts foreign VMs as golden_ticket and never lets them raise attention', () => {
    const list = [instance(), foreign]
    expect(paneSummaryLine(list, false)).toBe('1 golden_ticket VMs · 1 running · all green · 1 not golden_ticket')
    expect(paneNeedsAttention(list)).toBe(false)
  })
  it('ignores deleted VMs', () => expect(paneSummaryLine([instance(), instance({ name: 'x', deleted: true })], false)).toBe('1 golden_ticket VMs · 1 running · all green'))
})
