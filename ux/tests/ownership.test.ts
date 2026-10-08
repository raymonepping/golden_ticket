import { describe, expect, it } from 'vitest'
import { convergenceState, parseConvergence, parseOwnership, parseValidation, provisionOwnership } from '../server/utils/repository'

// Terraform's lab_nodes contract (terraform/infra output), as host mode reads it.
const labNodes = {
  'gt-vault-1': { role: 'cluster', group: 'vault', vault_role: 'leader', ipv4: '192.168.252.13', cpus: 2, memory: '4G', disk: '20G', token: 'never-read' },
  'gt-vault-2': { role: 'cluster', group: 'vault', vault_role: 'follower', ipv4: '192.168.252.11', cpus: 2, memory: '4G', disk: '20G' },
  'gt-vault-s': { role: 'seal', group: 'vault_seal', vault_role: 'seal', ipv4: '192.168.252.10', cpus: 1, memory: '2G', disk: '10G' },
  'gt-ux-1': { role: 'ux', group: 'ux', vault_role: 'none', ipv4: '192.168.252.14', cpus: 1, memory: '2G', disk: '10G' },
  'bad;name': { role: 'cluster', vault_role: 'leader' },
  'odd-role': { role: 'admin' },
}
const digest = 'a'.repeat(64)
const manifest = parseOwnership(labNodes, 'b'.repeat(64))

describe('Terraform ownership truth rules', () => {
  it('is unknown when the Terraform output is unreadable', () => expect(provisionOwnership('gt-vault-1', parseOwnership(null))).toBe('unknown'))
  it('is unknown for a pushed copy from another project', () => expect(provisionOwnership('gt-vault-1', parseOwnership({ project: 'red_pass', provisioned_by: 'terraform/infra', nodes: labNodes }))).toBe('unknown'))
  it('is unknown for a pushed copy not produced by Terraform', () => expect(provisionOwnership('gt-vault-1', parseOwnership({ project: 'golden_ticket', provisioned_by: 'ansible/provision.yml', nodes: labNodes }))).toBe('unknown'))
  it('proves provisioning by membership of lab_nodes', () => expect(provisionOwnership('gt-vault-1', manifest)).toBe('provisioned'))
  it('is unmanaged when a readable contract excludes the VM (red_pass, multi_pass)', () => {
    expect(provisionOwnership('red-vault-1', manifest)).toBe('unmanaged')
    expect(provisionOwnership('vault-1', manifest)).toBe('unmanaged')
  })
  it('maps role + vault_role and keeps only allow-listed nodes and fields', () => {
    expect(Object.keys(manifest.nodes).sort()).toEqual(['gt-ux-1', 'gt-vault-1', 'gt-vault-2', 'gt-vault-s'])
    expect(manifest.nodes['gt-vault-1']).toEqual({ role: 'leader', ipv4: '192.168.252.13', cpus: 2, memory: '4G' })
    expect(manifest.nodes['gt-vault-2']!.role).toBe('follower')
    expect(manifest.nodes['gt-vault-s']!.role).toBe('seal')
  })
  it('reads the same contract from the VM-mode copy, with its baseline digest', () => {
    const vm = parseOwnership({ project: 'golden_ticket', provisioned_by: 'terraform/infra', baseline_digest: digest, nodes: labNodes })
    expect(Object.keys(vm.nodes).sort()).toEqual(Object.keys(manifest.nodes).sort())
    expect(vm.baselineDigest).toBe(digest)
  })
  it('rejects a malformed baseline digest', () => expect(parseOwnership(labNodes, 'nope').baselineDigest).toBeNull())
})

describe('Ansible convergence truth rules', () => {
  const stamp = parseConvergence({ result: 'success', automation_digest: digest, finished_at: '2026-10-07T12:29:59Z', nodes: ['gt-vault-1', 'gt-vault-s'] })
  it('is converged only when the node ran and the digest matches', () => expect(convergenceState('gt-vault-1', stamp, digest)).toBe('converged'))
  it('is outdated when the automation changed since the run', () => expect(convergenceState('gt-vault-1', stamp, 'b'.repeat(64))).toBe('outdated'))
  it('is never-run for a node outside the stamp', () => expect(convergenceState('gt-vault-2', stamp, digest)).toBe('never-run'))
  it('is never-run without a stamp', () => expect(convergenceState('gt-vault-1', parseConvergence(null), digest)).toBe('never-run'))
  it('is failed for an unsuccessful run', () => expect(convergenceState('gt-vault-1', parseConvergence({ result: 'failed', automation_digest: digest, nodes: ['gt-vault-1'] }), digest)).toBe('failed'))
  it('is unknown when the current digest cannot be computed', () => expect(convergenceState('gt-vault-1', stamp, null)).toBe('unknown'))
  it('rejects a malformed digest', () => expect(parseConvergence({ result: 'success', automation_digest: 'zz', nodes: [] }).digest).toBeNull())
})

describe('validation report parsing', () => {
  it('coerces unexpected statuses to unknown and drops malformed rows', () => {
    const report = parseValidation({ generated_at: '2026-10-07T12:30:00Z', cluster: [{ id: 'raft_voters', label: 'Raft voters', status: 'pass', detail: '3 / 3' }, { id: 'x', label: 'X', status: 'great' }, { label: 'no id' }], seal_chain: 'nope' })
    expect(report.cluster.map(item => item.status)).toEqual(['pass', 'unknown'])
    expect(report.sealChain).toEqual([])
  })
})
