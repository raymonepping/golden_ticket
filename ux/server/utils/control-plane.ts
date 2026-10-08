import { resolve } from 'node:path'
import type { EvidenceCheck, FrontDoor, FrontDoorEntry, InstanceSummary, InstancesResponse, LabRole, PostureCategory, SealChain } from '../../shared/types'
import { aggregateStatus, category, isVaultRole } from '../../shared/posture'
import type { MultipassInstance } from './multipass'
import { bytes, instanceInfo, listInstances } from './multipass'
import { labMode } from './mode'
import { convergenceState, loadRepositoryEvidence, provisionOwnership, type RepositoryEvidence } from './repository'
import { nodeChecks, reportEvidence, type NodeChecks } from './checks'
import { publicError } from './command'

function evidence(id: string, label: string, status: EvidenceCheck['status'], source: EvidenceCheck['source'], detail: string, observedAt: string): EvidenceCheck {
  return { id, label, status, source, detail, scope: 'node', observedAt }
}

function provisionedPosture(instance: MultipassInstance, repo: RepositoryEvidence, now: string): PostureCategory {
  const ownership = provisionOwnership(instance.name, repo.manifest)
  if (ownership === 'unknown') {
    return category('provisioned', 'Unknown', [evidence('terraform', 'Terraform lab_nodes', 'unknown', 'terraform', 'terraform/infra state is missing or unreadable — run make infra.', now)])
  }
  if (ownership === 'unmanaged') {
    return category('provisioned', 'Unmanaged', [evidence('terraform', 'Terraform lab_nodes', 'warn', 'terraform', 'Not in terraform/infra: Terraform did not build this VM and golden_ticket never touches it.', now)])
  }
  const node = repo.manifest.nodes[instance.name]!
  const live = instance.ipv4[0]
  const ipMatches = !node.ipv4 || !live || node.ipv4 === live
  return category('provisioned', ipMatches ? 'Provisioned' : 'Drift detected', [
    evidence('terraform', 'Terraform lab_nodes', 'pass', 'terraform', `terraform/infra multipass_instance · role ${node.role}`, now),
    evidence('address', 'Address agreement', ipMatches ? 'pass' : 'fail', 'terraform', node.ipv4 ? `Terraform ${node.ipv4}; Multipass ${live || 'none'}` : 'No recorded address', now),
  ])
}

function ansiblePosture(instance: MultipassInstance, repo: RepositoryEvidence, provisioned: boolean, now: string): PostureCategory {
  if (!provisioned) return category('ansible', 'Never run', [evidence('ansible-scope', 'Convergence scope', 'unknown', 'ansible', 'Not a golden_ticket node.', now)])
  const state = convergenceState(instance.name, repo.stamp, repo.currentDigest)
  const at = repo.stamp.finishedAt || now
  const short = (digest: string | null) => digest ? `${digest.slice(0, 12)}…` : 'unavailable'
  switch (state) {
    case 'never-run':
      return category('ansible', 'Never run', [evidence('ansible-stamp', 'Last successful make lab', 'warn', 'ansible', 'No convergence stamp includes this node yet — run make lab.', now)])
    case 'failed':
      return category('ansible', 'Failed', [evidence('ansible-stamp', 'Last make lab', 'fail', 'ansible', 'The recorded run did not succeed.', at)])
    case 'unknown':
      return category('ansible', 'Unknown', [evidence('ansible-digest', 'Automation digest', 'unknown', 'ansible', 'The stamp or the current digest is unavailable.', at)])
    default:
      return category('ansible', state === 'converged' ? 'Converged' : 'Outdated', [
        evidence('ansible-stamp', 'Last successful make lab', 'pass', 'ansible', `Finished ${repo.stamp.finishedAt ?? 'at an unknown time'}; node included.`, at),
        evidence('ansible-digest', 'Automation digest', state === 'converged' ? 'pass' : 'warn', 'ansible', state === 'converged'
          ? `Matches ${short(repo.currentDigest)}`
          : `Automation changed since the last run (applied ${short(repo.stamp.digest)}, now ${short(repo.currentDigest)}). Run make lab.`, now),
      ])
  }
}

function unavailableCategory(kind: 'rhel' | 'vault' | 'service', reason: string, now: string): PostureCategory {
  const label = kind === 'rhel' ? 'Guest checks' : kind === 'vault' ? 'Vault health' : 'Service health'
  return category(kind, 'Unknown', [evidence(`${kind}-unavailable`, label, 'unknown', kind === 'service' ? 'rhel' : kind, reason, now)])
}

interface BuiltInstance { summary: InstanceSummary, checks: NodeChecks | null }

async function buildInstance(instance: MultipassInstance, repo: RepositoryEvidence, report: ReturnType<typeof reportEvidence>, now: string, deep: boolean): Promise<BuiltInstance> {
  const vm = labMode() === 'vm'
  const provisioned = provisionedPosture(instance, repo, now)
  const labRole: LabRole | null = repo.manifest.nodes[instance.name]?.role ?? null
  const vaultNode = isVaultRole(labRole)
  // VM mode cannot see Multipass state: it always tries the probe and derives
  // Reachable / Unreachable from the answer.
  const running = vm || instance.state.toLowerCase() === 'running'
  const mayCheck = deep && labRole !== null && running
  const checks = mayCheck ? await nodeChecks(instance.name, instance.ipv4[0], labRole, repo.manifest.baselineDigest) : null
  const reason = !deep ? 'Posture checks are loading.' : labRole ? 'The instance is not running.' : 'Checks run only for golden_ticket nodes.'
  const fourth = vaultNode ? 'vault' : 'service'

  const rhel = checks
    ? category('rhel', aggregateStatus(checks.rhel, { pass: 'Healthy', warn: 'Attention required', fail: 'Unreachable', unknown: 'Unknown' }), checks.rhel)
    : unavailableCategory('rhel', reason, now)
  const ansible = ansiblePosture(instance, repo, labRole !== null, now)
  // Cluster-scope evidence goes to cluster nodes only; the seal Vault gets the
  // seal-chain evidence; service VMs are judged on their own service.
  const scoped = labRole === 'seal'
    ? report.sealChain
    : vaultNode
      ? [...report.cluster, ...report.sealChain]
      : labRole === 'identity' ? report.identity : labRole === 'proxy' ? report.frontDoor : []
  const fourthEvidence = checks ? [...checks.vault, ...scoped] : []
  const labels = vaultNode
    ? { pass: 'Secured', warn: 'Attention required', fail: 'Not ready', unknown: 'Unknown' }
    : { pass: 'Healthy', warn: 'Attention required', fail: 'Down', unknown: 'Unknown' }
  const vault = checks
    ? category(fourth, aggregateStatus(fourthEvidence, labels), fourthEvidence)
    : unavailableCategory(fourth, reason, now)

  // Multipass reports only the EFI partition for these RHEL guests; prefer the
  // guest's own root filesystem size when the probe has it.
  const resources = checks?.rootBytes ? { ...instance.resources, diskBytes: checks.rootBytes } : instance.resources
  const state = vm ? (checks?.reachable ? 'Reachable' : checks ? 'Unreachable' : 'Checking') : instance.state
  const release = instance.release ?? checks?.release ?? null
  return { summary: { ...instance, state, release, resources, labRole, posture: { provisioned, rhel, ansible, vault } }, checks }
}

/** VM mode: Terraform's lab_nodes (pushed copy) is the inventory (Multipass is not reachable). */
function manifestInstances(repo: RepositoryEvidence): MultipassInstance[] {
  return Object.entries(repo.manifest.nodes).map(([name, node]) => ({
    name,
    state: 'Checking',
    ipv4: node.ipv4 ? [node.ipv4] : [],
    release: null,
    imageHash: null,
    resources: { cpus: node.cpus, memoryBytes: node.memory ? bytes(node.memory) : null, diskBytes: null },
    snapshotCount: null,
    deleted: false,
  }))
}

/** Live seal chain: the seal Vault and, per cluster node, whether it is transit-sealed and unsealed. */
export function sealChainFrom(built: BuiltInstance[]): SealChain | null {
  const seal = built.find(item => item.summary.labRole === 'seal')
  if (!seal) return null
  const sealFacts = seal.checks?.facts
  const sealVault = !sealFacts?.reachable
    ? { status: 'unknown' as const, sealed: null, detail: seal.summary.state.toLowerCase() === 'running' ? 'No verified answer' : seal.summary.state }
    : sealFacts.sealed
      ? { status: 'fail' as const, sealed: true, detail: 'Sealed — run make unseal' }
      : { status: 'pass' as const, sealed: false, detail: 'Unsealed · Transit key serving' }
  const agentNode = built.find(item => item.summary.labRole === 'agent')
  const agentChecks = agentNode?.checks?.vault ?? []
  const agent = !agentNode
    ? null
    : !agentNode.checks?.reachable
        ? { node: agentNode.summary.name, status: 'unknown' as const, detail: 'No verified answer' }
        : agentChecks.every(item => item.status === 'pass')
          ? { node: agentNode.summary.name, status: 'pass' as const, detail: 'AppRole token held · mTLS proxy serving' }
          : { node: agentNode.summary.name, status: 'fail' as const, detail: agentChecks.filter(item => item.status !== 'pass').map(item => item.label).join(', ') }
  const via = agent ? 'via the seal agent' : 'via transit'
  const links = built
    .filter(item => item.summary.labRole === 'leader' || item.summary.labRole === 'follower')
    .sort((a, b) => a.summary.name.localeCompare(b.summary.name))
    .map(({ summary, checks }) => {
      const facts = checks?.facts
      if (!facts?.reachable) {
        return { node: summary.name, sealType: null, sealed: null, status: 'unknown' as const, detail: sealVault.sealed ? 'Waiting for the seal Vault' : summary.state.toLowerCase() === 'running' ? 'No verified answer' : summary.state }
      }
      const ok = facts.sealType === 'transit' && facts.sealed === false
      return { node: summary.name, sealType: facts.sealType, sealed: facts.sealed, status: ok ? 'pass' as const : 'fail' as const, detail: ok ? `Auto-unsealed ${via}` : facts.sealed ? 'Sealed' : `Seal type ${facts.sealType ?? 'unknown'}` }
    })
  return { sealNode: seal.summary.name, sealVault, agent, links }
}

/** Public entry points, in the order an operator reads them. */
const FRONT_DOOR: { match: (backend: string) => boolean, key: string, label: string, port: number }[] = [
  { match: b => b === 'vault_active', key: 'vault', label: 'Vault — UI, API, writes (active node)', port: 8200 },
  { match: b => b === 'vault_any', key: 'vault-reads', label: 'Vault — reads (any unsealed node)', port: 8202 },
  { match: b => b === 'ui', key: 'ui', label: 'golden_ticket console', port: 443 },
  { match: b => b === 'keycloak', key: 'keycloak', label: 'Keycloak (realm golden-ticket)', port: 8443 },
  { match: b => b === 'seal_vault', key: 'seal', label: 'Seal Vault (operator)', port: 8210 },
  { match: b => b.startsWith('node_') && b !== 'node_unknown', key: 'nodes', label: 'Any node by path (/node/<name>/…)', port: 9000 },
]

/** Front door from the proxy's live probe; null when there is no proxy. */
export function frontDoorFrom(built: BuiltInstance[]): FrontDoor | null {
  const proxy = built.find(item => item.summary.labRole === 'proxy')
  if (!proxy) return null
  const host = proxy.summary.ipv4[0] || proxy.summary.name
  const servers = proxy.checks?.frontDoor ?? []
  const entries: FrontDoorEntry[] = FRONT_DOOR.map(entry => ({
    key: entry.key,
    label: entry.label,
    url: `https://${host}${entry.port === 443 ? '' : `:${entry.port}`}`,
    servers: servers.filter(item => entry.match(item.backend)).map((item) => {
      let status = (['UP', 'DOWN', 'MAINT'].includes(item.status) ? item.status : 'UNKNOWN') as FrontDoorEntry['servers'][number]['status']
      // The write path checks bare sys/health, which only the leader passes:
      // a node that is unsealed (UP on the reads path) is a standby, not down.
      if (entry.key === 'vault' && status === 'DOWN' && servers.some(s => s.backend === 'vault_any' && s.server === item.server && s.status === 'UP')) status = 'STANDBY'
      return { name: item.server, status }
    }),
  })).filter(entry => entry.servers.length > 0 || !proxy.checks)
  return { node: proxy.summary.name, entries }
}

export function repositoryRoot(): string {
  const configured = useRuntimeConfig().repositoryRoot
  return resolve(process.cwd(), typeof configured === 'string' ? configured : '..')
}

export async function getControlPlane(options: { deep?: boolean } = {}): Promise<InstancesResponse> {
  const now = new Date().toISOString()
  const deep = options.deep !== false
  const mode = labMode()
  try {
    const repo = await loadRepositoryEvidence(repositoryRoot())
    if (mode === 'vm' && !repo.manifest.readable) throw new Error('evidence unavailable')
    const instances = mode === 'vm'
      ? manifestInstances(repo)
      : await Promise.all((await listInstances()).map(async (instance) => {
          try {
            return await instanceInfo(instance.name) || instance
          } catch {
            return instance
          }
        }))
    const report = reportEvidence(repo.report)
    const built = await Promise.all(instances.map(instance => buildInstance(instance, repo, report, now, deep)))
    const enriched = built.map(item => item.summary)
    return {
      mode,
      available: true,
      message: null,
      observedAt: now,
      summary: {
        total: enriched.length,
        running: enriched.filter(item => ['running', 'reachable'].includes(item.state.toLowerCase())).length,
        stopped: enriched.filter(item => item.state.toLowerCase() === 'stopped').length,
        deleted: enriched.filter(item => item.deleted).length,
        cpus: enriched.reduce((sum, item) => sum + (item.resources.cpus || 0), 0),
        memoryBytes: enriched.reduce((sum, item) => sum + (item.resources.memoryBytes || 0), 0),
      },
      instances: enriched,
      cluster: deep ? report.cluster : [],
      sealChain: deep ? sealChainFrom(built) : null,
      frontDoor: deep ? frontDoorFrom(built) : null,
    }
  } catch (error) {
    return {
      mode,
      available: false,
      message: mode === 'vm'
        ? 'Lab evidence is not available on this VM yet — run make ux-sync on the host.'
        : publicError(error, 'Multipass data could not be read.'),
      observedAt: now,
      summary: { total: 0, running: 0, stopped: 0, deleted: 0, cpus: 0, memoryBytes: 0 },
      instances: [],
      cluster: [],
      sealChain: null,
      frontDoor: null,
    }
  }
}
