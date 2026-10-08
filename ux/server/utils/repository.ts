import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EvidenceStatus, LabRole } from '../../shared/types'
import { runCommand } from './command'
import { cached } from './cache'
import { INSTANCE_NAME_PATTERN } from './multipass'
import { labMode } from './mode'

/*
 * Read-only adapters over the non-secret evidence. Ownership is Terraform's:
 * the `lab_nodes` output of terraform/infra (host mode runs `terraform output`
 * live; VM mode reads the copy ux-sync pushed). Everything else comes from
 * .build/ (Ansible and the gates). Every field is parsed through an
 * allow-list; nothing else in those files (or anywhere under .secrets/) is
 * ever read or returned.
 */

export interface OwnershipManifest {
  readable: boolean
  /** Digest of the RHEL baseline the last terraform apply ran (infra output). */
  baselineDigest: string | null
  nodes: Record<string, { role: LabRole, ipv4: string | null, cpus: number | null, memory: string | null }>
}

export interface ConvergenceStamp {
  readable: boolean
  success: boolean
  finishedAt: string | null
  digest: string | null
  nodes: string[]
}

export interface ReportCheck { id: string, label: string, status: EvidenceStatus, detail: string }

export interface ValidationReport {
  readable: boolean
  generatedAt: string | null
  cluster: ReportCheck[]
  sealChain: ReportCheck[]
  identity: ReportCheck[]
  frontDoor: ReportCheck[]
}

type UnknownRecord = Record<string, unknown>
const record = (value: unknown): UnknownRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
const text = (value: unknown, max = 200): string | null => typeof value === 'string' ? value.slice(0, max) : null
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const isoOrNull = (value: unknown): string | null => typeof value === 'string' && ISO.test(value) ? value : null
const ROLES: LabRole[] = ['seal', 'leader', 'follower', 'ux', 'identity', 'proxy', 'agent']
const STATUSES: EvidenceStatus[] = ['pass', 'warn', 'fail', 'unknown']

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

/** Terraform lab_nodes role + vault_role → the console's lab role. */
function labRole(role: unknown, vaultRole: unknown): LabRole | null {
  if (role === 'cluster') return vaultRole === 'leader' ? 'leader' : 'follower'
  return ROLES.find(item => item === role) ?? null
}

/**
 * Parse Terraform's `lab_nodes` contract: name → { role, group, vault_role,
 * ipv4, cpus, memory, disk }. VM mode wraps it as
 * { project: "golden_ticket", provisioned_by: "terraform/infra",
 *   baseline_digest, nodes: <lab_nodes> }.
 */
export function parseOwnership(raw: unknown, baselineDigest: unknown = null): OwnershipManifest {
  const root = record(raw)
  if (raw === null) return { readable: false, baselineDigest: null, nodes: {} }
  const wrapped = root.provisioned_by !== undefined
  if (wrapped && (root.project !== 'golden_ticket' || root.provisioned_by !== 'terraform/infra')) {
    return { readable: false, baselineDigest: null, nodes: {} }
  }
  const source = wrapped ? record(root.nodes) : root
  const digest = wrapped ? root.baseline_digest : baselineDigest
  const nodes: OwnershipManifest['nodes'] = {}
  for (const [name, value] of Object.entries(source)) {
    const node = record(value)
    if (!INSTANCE_NAME_PATTERN.test(name)) continue
    const role = labRole(node.role, node.vault_role)
    if (!role) continue
    nodes[name] = {
      role,
      ipv4: text(node.ipv4, 45),
      cpus: typeof node.cpus === 'number' && Number.isInteger(node.cpus) ? node.cpus : null,
      memory: text(node.memory, 16),
    }
  }
  return {
    readable: true,
    baselineDigest: typeof digest === 'string' && /^[0-9a-f]{64}$/.test(digest) ? digest : null,
    nodes,
  }
}

export function parseConvergence(raw: unknown): ConvergenceStamp {
  const root = record(raw)
  if (raw === null) return { readable: false, success: false, finishedAt: null, digest: null, nodes: [] }
  const digest = typeof root.automation_digest === 'string' && /^[0-9a-f]{64}$/.test(root.automation_digest) ? root.automation_digest : null
  const nodes = Array.isArray(root.nodes) ? root.nodes.filter((item): item is string => typeof item === 'string' && INSTANCE_NAME_PATTERN.test(item)) : []
  return { readable: true, success: root.result === 'success', finishedAt: isoOrNull(root.finished_at), digest, nodes }
}

function parseChecks(value: unknown): ReportCheck[] {
  if (!Array.isArray(value)) return []
  return value.map(record).flatMap((item) => {
    const id = text(item.id, 64)
    const label = text(item.label, 120)
    if (!id || !label) return []
    const status = STATUSES.find(candidate => candidate === item.status) ?? 'unknown'
    return [{ id, label, status, detail: text(item.detail) ?? '' }]
  })
}

export function parseValidation(raw: unknown): ValidationReport {
  const root = record(raw)
  if (raw === null) return { readable: false, generatedAt: null, cluster: [], sealChain: [], identity: [], frontDoor: [] }
  return {
    readable: true,
    generatedAt: isoOrNull(root.generated_at),
    cluster: parseChecks(root.cluster),
    sealChain: parseChecks(root.seal_chain),
    identity: parseChecks(root.identity),
    frontDoor: parseChecks(root.front_door),
  }
}

/** "Provisioned by Terraform" truth rule: an unreadable contract is unknown, never unmanaged. */
export function provisionOwnership(name: string, manifest: Pick<OwnershipManifest, 'readable' | 'nodes'>): 'provisioned' | 'unmanaged' | 'unknown' {
  if (!manifest.readable) return 'unknown'
  return manifest.nodes[name] ? 'provisioned' : 'unmanaged'
}

/** Converged only when the last successful run included the node and its digest matches today's automation. */
export function convergenceState(name: string, stamp: ConvergenceStamp, currentDigest: string | null): 'converged' | 'outdated' | 'never-run' | 'failed' | 'unknown' {
  if (!stamp.readable) return 'never-run'
  if (!stamp.success) return 'failed'
  if (!stamp.digest || !currentDigest) return 'unknown'
  if (!stamp.nodes.includes(name)) return 'never-run'
  return stamp.digest === currentDigest ? 'converged' : 'outdated'
}

export interface RepositoryEvidence {
  manifest: OwnershipManifest
  stamp: ConvergenceStamp
  report: ValidationReport
  currentDigest: string | null
}

const DIGEST = /^[0-9a-f]{64}$/

/** Host mode: the Terraform contract, read live (narrow outputs, never `show`). */
async function terraformOwnership(repositoryRoot: string): Promise<OwnershipManifest> {
  const output = async (name: string): Promise<unknown | null> => {
    try {
      const { stdout } = await runCommand('terraform', [`-chdir=${resolve(repositoryRoot, 'terraform/infra')}`, 'output', '-json', name], {
        cwd: repositoryRoot,
        timeoutMs: 20_000,
      })
      return JSON.parse(stdout)
    } catch {
      return null
    }
  }
  const [nodes, digest] = await Promise.all([output('lab_nodes'), output('baseline_digest')])
  return parseOwnership(nodes, digest)
}

/**
 * Host mode reads Terraform live, the repository's .build/ and runs the
 * digest script; VM mode reads the copies Ansible pushed to GT_EVIDENCE_DIR,
 * including the digest computed on the controller at sync time.
 */
export async function loadRepositoryEvidence(repositoryRoot: string): Promise<RepositoryEvidence> {
  return cached('repository-evidence', 5_000, async () => {
    const vm = labMode() === 'vm'
    const dir = vm ? (process.env.GT_EVIDENCE_DIR || '/var/lib/gt-ux/evidence') : resolve(repositoryRoot, '.build')
    const digest = vm
      ? readFile(resolve(dir, 'automation-digest.txt'), 'utf8').then(value => DIGEST.test(value.trim()) ? value.trim() : null).catch(() => null)
      : runCommand(resolve(repositoryRoot, 'scripts/automation-digest.sh'), [], { cwd: repositoryRoot, timeoutMs: 10_000 })
          .then(({ stdout }) => DIGEST.test(stdout.trim()) ? stdout.trim() : null)
          .catch(() => null)
    const [manifest, stamp, report, currentDigest] = await Promise.all([
      vm ? readJson(resolve(dir, 'ownership.json')).then(raw => parseOwnership(raw)) : terraformOwnership(repositoryRoot),
      readJson(resolve(dir, 'convergence.json')).then(parseConvergence),
      readJson(resolve(dir, 'validation.json')).then(parseValidation),
      digest,
    ])
    return { manifest, stamp, report, currentDigest }
  })
}
