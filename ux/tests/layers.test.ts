import { describe, expect, it } from 'vitest'
import { parseEnginesPlan, parseLayers } from '../server/utils/layers'

const at = '2026-10-08T12:00:00Z'

describe('layers evidence', () => {
  it('is unreadable without a phases list, and every gate is unknown (never green)', () => {
    const layers = parseLayers(null)
    expect(layers.readable).toBe(false)
    expect(layers.gates.every(gate => gate.result === 'unknown')).toBe(true)
  })

  it('keeps the phase order and tool-specific fields only', () => {
    const layers = parseLayers({
      generated_at: at,
      phases: [
        { phase: 'infra', tool: 'terraform', resources: 27, last_apply: { result: 'success', at }, last_plan: { result: 'clean', at }, last_run: { at, changed: 9 } },
        { phase: 'converge', tool: 'ansible', last_run: { at, changed: 0, failed: 0 }, last_check: { at, changed: 0 }, resources: 99 },
        { phase: 'evil;rm', tool: 'ansible' },
        { phase: 'x', tool: 'shell' },
      ],
      gates: { idempotency: { result: 'pass', at }, drift: { result: 'great', at }, 'secret-scan': { result: 'fail', at } },
    })
    expect(layers.phases.map(p => p.phase)).toEqual(['infra', 'converge'])
    expect(layers.phases[0]).toMatchObject({ tool: 'terraform', resources: 27, lastPlan: { result: 'clean' }, lastRun: null })
    expect(layers.phases[1]).toMatchObject({ tool: 'ansible', resources: null, lastRun: { changed: 0 }, lastCheck: { changed: 0 }, allowedChanges: null })
    expect(Object.fromEntries(layers.gates.map(g => [g.name, g.result]))).toEqual({ idempotency: 'pass', drift: 'unknown', 'secret-scan': 'fail', validation: 'unknown' })
  })

  it('treats an unknown plan result as unknown, not clean', () => {
    const layers = parseLayers({ phases: [{ phase: 'seal', tool: 'terraform', last_plan: { result: 'fine', at } }] })
    expect(layers.phases[0]!.lastPlan!.result).toBe('unknown')
  })
})

describe('engines plan (terraform/platform output)', () => {
  it('lists mounted engines and skipped engines with their reason', () => {
    const plan = parseEnginesPlan({ namespace: 'engines', mounted: ['kv', 'transit'], skipped: { keymgmt: 'licence lacks Key Management Secrets Engine', 'bad path': 'x' } })
    expect(plan.mounted).toEqual(['kv', 'transit'])
    expect(plan.skipped).toEqual([{ path: 'keymgmt', reason: 'licence lacks Key Management Secrets Engine' }])
  })
  it('is unreadable without a mounted list', () => expect(parseEnginesPlan({}).readable).toBe(false))
})

describe('layers digest default', () => {
  it('never claims a digest the parser did not see', () => {
    expect(parseLayers({ phases: [] }).digest).toEqual({ applied: null, current: null })
  })
})

describe('allowed changes', () => {
  it('carries the documented reason for an allowed Ansible change, never for Terraform', () => {
    const layers = parseLayers({ phases: [
      { phase: 'ux', tool: 'ansible', allowed_changes: 'evidence sync', last_run: { at, changed: 1 } },
      { phase: 'infra', tool: 'terraform', allowed_changes: 'nope' },
    ] })
    expect(layers.phases[0]!.allowedChanges).toBe('evidence sync')
    expect(layers.phases[1]!.allowedChanges).toBeNull()
  })
})
