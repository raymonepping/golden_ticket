import { describe, expect, it } from 'vitest'
import { expectedSealType, parseRootFs, reportEvidence, REPORT_MAX_AGE_MS, vaultEvidence } from '../server/utils/checks'
import { parseValidation } from '../server/utils/repository'
import { operationMessage } from '../server/utils/operation-message'
import { category } from '../shared/posture'
import type { InstanceSummary } from '../shared/types'

const health = (standby: boolean) => JSON.stringify({ initialized: true, sealed: false, standby })
const sealStatus = (type: string, sealed = false) => JSON.stringify({ type, initialized: true, sealed })

describe('seal-node vs cluster-node Vault posture', () => {
  it('expects Shamir on the seal Vault and transit on the cluster', () => {
    expect(expectedSealType('seal')).toBe('shamir')
    expect(expectedSealType('leader')).toBe('transit')
  })
  it('passes a transit-sealed cluster node', () => {
    const { checks, facts } = vaultEvidence('follower', { vault_service: 'active', vault_health: health(true), vault_seal: sealStatus('transit') })
    expect(checks.every(item => item.status === 'pass')).toBe(true)
    expect(facts).toEqual({ reachable: true, initialized: true, sealed: false, sealType: 'transit' })
  })
  it('fails a cluster node that reports a Shamir seal', () => {
    const { checks } = vaultEvidence('leader', { vault_service: 'active', vault_health: health(false), vault_seal: sealStatus('shamir') })
    expect(checks.find(item => item.id === 'vault-seal-type')?.status).toBe('fail')
  })
  it('fails a sealed seal Vault and does not claim an HA role', () => {
    const { checks } = vaultEvidence('seal', { vault_service: 'active', vault_health: health(true), vault_seal: sealStatus('shamir', true) })
    expect(checks.find(item => item.id === 'vault-seal')?.status).toBe('fail')
    expect(checks.find(item => item.id === 'vault-role')?.status).toBe('unknown')
  })
  it('treats an unanswered API as failing, never passing', () => {
    const { checks, facts } = vaultEvidence('follower', { vault_service: 'activating', vault_health: '', vault_seal: '' })
    expect(checks.some(item => item.status === 'pass')).toBe(false)
    expect(facts.reachable).toBe(false)
  })
})

describe('validation report evidence', () => {
  const report = parseValidation({ generated_at: '2026-10-07T12:00:00Z', cluster: [{ id: 'raft_voters', label: 'Raft voters', status: 'pass', detail: '3 / 3' }], seal_chain: [{ id: 'seal_token_ttl', label: 'Seal token TTL', status: 'pass', detail: '720h' }] })
  const generated = Date.parse('2026-10-07T12:00:00Z')
  it('is unknown when no report exists', () => expect(reportEvidence(parseValidation(null)).cluster[0]?.status).toBe('unknown'))
  it('passes a fresh report', () => expect(reportEvidence(report, generated + 60_000).cluster.every(item => item.status === 'pass')).toBe(true))
  it('marks a stale report as needing attention', () => expect(reportEvidence(report, generated + REPORT_MAX_AGE_MS + 1).cluster[0]?.status).toBe('warn'))
  it('scopes seal-chain evidence separately', () => expect(reportEvidence(report, generated).sealChain.every(item => item.scope === 'seal-chain')).toBe(true))
  it('adds identity evidence only when the report has it', () => {
    expect(reportEvidence(report, generated).identity).toEqual([])
    const withIdentity = parseValidation({ generated_at: '2026-10-07T12:00:00Z', identity: [{ id: 'ldap-raymon', label: 'Vault LDAP login · raymon', status: 'pass', detail: 'identity policies gt-admin' }] })
    expect(reportEvidence(withIdentity, generated).identity.map(item => item.scope)).toEqual(['identity', 'identity'])
  })
})

describe('operation feedback', () => {
  const node = (labRole: InstanceSummary['labRole'], vault: string): InstanceSummary => ({
    name: labRole === 'seal' ? 'gt-vault-s' : 'gt-vault-2', state: 'Running', ipv4: [], release: null, imageHash: null,
    resources: { cpus: null, memoryBytes: null, diskBytes: null }, snapshotCount: null, deleted: false, labRole,
    posture: { provisioned: category('provisioned', 'Provisioned', []), rhel: category('rhel', 'Healthy', []), ansible: category('ansible', 'Converged', []), vault: category('vault', vault, []) },
  })
  it('tells the operator to unseal a restarted seal Vault', () => expect(operationMessage('restart', node('seal', 'Not ready'))).toMatch(/make unseal/))
  it('reports auto-unseal for a cluster node', () => expect(operationMessage('restart', node('follower', 'Secured'))).toMatch(/auto-unsealed/))
  it('never calls a not-ready node ready', () => expect(operationMessage('restart', node('follower', 'Not ready'))).not.toMatch(/auto-unsealed/))
})

describe('guest disk evidence', () => {
  it('parses df output', () => expect(parseRootFs('20178747392 9%')).toEqual({ bytes: 20178747392, usedPercent: 9 }))
  it('rejects anything else', () => expect(parseRootFs('Filesystem 1B-blocks')).toBeNull())
})
