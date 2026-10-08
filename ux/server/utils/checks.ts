import { isIP } from 'node:net'
import type { EvidenceCheck, LabRole, VaultRole } from '../../shared/types'
import { isVaultRole } from '../../shared/posture'
import { runCommand } from './command'
import { labMode } from './mode'
import { cached } from './cache'
import type { ReportCheck, ValidationReport } from './repository'

const observedAt = () => new Date().toISOString()
const check = (id: string, label: string, status: EvidenceCheck['status'], source: EvidenceCheck['source'], detail: string, scope: EvidenceCheck['scope'] = 'node', at = observedAt()): EvidenceCheck => ({ id, label, status, source, detail, scope, observedAt: at })

/** Validation evidence older than this is shown as stale ("warn"), not trusted as current. */
export const REPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Installed by Ansible (role lab_probe) on every node; takes no arguments. */
export const PROBE_PATH = '/usr/local/libexec/gt-probe'

export interface VaultFacts {
  reachable: boolean
  initialized: boolean | null
  sealed: boolean | null
  sealType: string | null
}

export interface NodeChecks {
  /** The probe answered (VM mode derives the node state from this). */
  reachable: boolean
  release: string | null
  rhel: EvidenceCheck[]
  /** Vault evidence on Vault nodes, service evidence on service nodes. */
  vault: EvidenceCheck[]
  facts: VaultFacts
  /** Root filesystem size from the guest; Multipass reports only the EFI partition for these RHEL images. */
  rootBytes: number | null
  /** Proxy only: backend/server/status triples from HAProxy stats. */
  frontDoor?: FrontDoorServer[]
}

export interface FrontDoorServer { backend: string, server: string, status: string }

/** Parse `backend:server:STATUS;...` from the proxy probe; allow-listed shapes only. */
export function parseFrontDoor(value: string | undefined): FrontDoorServer[] {
  return (value || '').split(';').flatMap((item) => {
    const [backend, server, status] = item.split(':')
    if (!backend || !server || !/^[a-z0-9_]{1,40}$/.test(backend) || !/^[a-z0-9-]{1,63}$/.test(server)) return []
    return [{ backend, server, status: /^(UP|DOWN|MAINT|NOLB|DRAIN|no check)/.test(status || '') ? (status || '').split(' ')[0]! : 'UNKNOWN' }]
  })
}

/** Parse `df -B1 --output=size,pcent /` ("20178747392 9%") into bytes and percent used. */
export function parseRootFs(value: string | undefined): { bytes: number, usedPercent: number } | null {
  const match = (value || '').trim().match(/^(\d+)\s+(\d+)%$/)
  return match ? { bytes: Number(match[1]), usedPercent: Number(match[2]) } : null
}

const NO_FACTS: VaultFacts = { reachable: false, initialized: null, sealed: null, sealType: null }

export function parseProbe(output: string): Record<string, string> {
  return Object.fromEntries(output.split('\n').map((line) => {
    const separator = line.indexOf('=')
    return separator < 1 ? ['', ''] : [line.slice(0, separator), line.slice(separator + 1)]
  }).filter(([key]) => key))
}

function json(value: string | undefined): Record<string, unknown> | null {
  try {
    const parsed: unknown = value ? JSON.parse(value) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** The seal type a node must report: the seal Vault is Shamir, cluster nodes use the transit seal. */
export const expectedSealType = (role: VaultRole) => role === 'seal' ? 'shamir' : 'transit'

export function vaultEvidence(role: VaultRole, values: Record<string, string>): { checks: EvidenceCheck[], facts: VaultFacts } {
  const health = json(values.vault_health)
  const seal = json(values.vault_seal)
  if (!health || !seal) {
    return {
      checks: [
        check('vault-service', 'Vault service', values.vault_service === 'active' ? 'pass' : 'fail', 'vault', values.vault_service || 'inactive'),
        check('vault-reachable', 'Vault API over verified TLS', 'fail', 'vault', 'No verified answer from the node API (it may be waiting for the seal Vault).'),
      ],
      facts: NO_FACTS,
    }
  }
  const initialized = seal.initialized === true
  const sealed = seal.sealed !== false
  const sealType = typeof seal.type === 'string' ? seal.type : null
  const expected = expectedSealType(role)
  const haRole = health.standby === true ? 'Standby' : health.performance_standby === true ? 'Performance standby' : sealed ? 'Unavailable' : 'Active'
  return {
    checks: [
      check('vault-service', 'Vault service', values.vault_service === 'active' ? 'pass' : 'fail', 'vault', values.vault_service || 'inactive'),
      check('vault-tls', 'Vault API over verified TLS', 'pass', 'vault', 'Answered with the lab CA'),
      check('vault-initialized', 'Initialized', initialized ? 'pass' : 'fail', 'vault', initialized ? 'Initialized' : 'Not initialized'),
      check('vault-seal', 'Seal state', sealed ? 'fail' : 'pass', 'vault', sealed ? 'Sealed' : 'Unsealed'),
      check('vault-seal-type', 'Seal type', sealType === expected ? 'pass' : 'fail', 'vault', `${sealType ?? 'unknown'} (expected ${expected})`),
      check('vault-role', 'HA role', sealed ? 'unknown' : 'pass', 'vault', haRole),
    ],
    facts: { reachable: true, initialized, sealed, sealType },
  }
}

/** Service VMs: is the node's own service up and answering over TLS? */
export function serviceEvidence(values: Record<string, string>): EvidenceCheck[] {
  // One row per unit: the probe reports `a,b` / `active,active`.
  const units = (values.service_unit || 'service').split(',').filter(Boolean)
  const states = (values.service_active || '').split(',')
  return [
    ...units.map((unit, index) => check(`service-unit-${unit}`, `${unit} service`, states[index] === 'active' ? 'pass' : 'fail', 'rhel', states[index] || 'inactive')),
    check('service-https', 'HTTPS health', values.service_http === '200' ? 'pass' : 'fail', 'rhel', values.service_http && values.service_http !== '000' ? `HTTP ${values.service_http} over verified TLS` : 'No answer'),
  ]
}

/** Run the installed probe: via Multipass on the host, via forced-command SSH in the VM. */
export async function runProbe(name: string, address: string): Promise<string> {
  if (labMode() === 'vm') {
    const key = process.env.GT_PROBE_KEY || '/etc/gt-ux/probe_ed25519'
    const knownHosts = process.env.GT_KNOWN_HOSTS || '/etc/gt-ux/known_hosts'
    const { stdout } = await runCommand('ssh', [
      '-F', '/dev/null', '-i', key, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${knownHosts}`, '-o', 'ConnectTimeout=4',
      `gtprobe@${address}`,
    ], { timeoutMs: 12_000 })
    return stdout
  }
  const { stdout } = await runCommand('multipass', ['exec', name, '--', PROBE_PATH], { timeoutMs: 12_000 })
  return stdout
}

/** The RHEL baseline Terraform ran (ansible_playbook.baseline) is what the node reports. */
export function baselineCheck(reported: string | undefined, expected: string | null): EvidenceCheck {
  const short = (value: string) => `${value.slice(0, 12)}…`
  if (!expected) return check('baseline', 'Baseline (run by Terraform)', 'unknown', 'terraform', 'The applied baseline digest is unavailable.')
  if (!reported || !/^[0-9a-f]{64}$/.test(reported)) return check('baseline', 'Baseline (run by Terraform)', 'fail', 'terraform', 'The node reports no baseline — run make infra.')
  return reported === expected
    ? check('baseline', 'Baseline (run by Terraform)', 'pass', 'terraform', `terraform/infra ansible_playbook.baseline · ${short(expected)}`)
    : check('baseline', 'Baseline (run by Terraform)', 'warn', 'terraform', `Node runs ${short(reported)}, Terraform applied ${short(expected)} — run make infra.`)
}

export async function nodeChecks(name: string, address: string | undefined, role: LabRole, baselineDigest: string | null = null): Promise<NodeChecks> {
  return cached(`node:${name}:${address || 'unknown'}:${baselineDigest || '-'}`, 10_000, async () => {
    if (!address || isIP(address) !== 4) {
      return {
        reachable: false,
        release: null,
        rhel: [check('rhel-reachable', 'Guest checks', 'unknown', 'rhel', 'A validated node address is unavailable.')],
        vault: [check('vault-reachable', isVaultRole(role) ? 'Vault health' : 'Service health', 'unknown', isVaultRole(role) ? 'vault' : 'rhel', 'A validated node address is unavailable.')],
        facts: NO_FACTS,
        rootBytes: null,
      }
    }
    try {
      const values = parseProbe((await runProbe(name, address)).trim())
      const rhel = [
        check('rhel-release', 'Operating system', /^Red Hat Enterprise Linux(?: Server)? release 9\./.test(values.release || '') ? 'pass' : 'warn', 'rhel', values.release || 'Release unavailable'),
        check('architecture', 'Architecture', ['aarch64', 'arm64'].includes(values.architecture || '') ? 'pass' : 'warn', 'rhel', values.architecture || 'Unknown'),
        check('selinux', 'SELinux', values.selinux === 'Enforcing' ? 'pass' : 'fail', 'rhel', values.selinux || 'Unknown'),
        check('swap', 'Swap', values.swap === 'disabled' ? 'pass' : 'fail', 'rhel', values.swap === 'disabled' ? 'Disabled' : 'Active swap detected'),
        check('firewalld', 'Firewall', values.firewall === 'active' ? 'pass' : 'fail', 'rhel', values.firewall || 'Inactive'),
        check('systemd', 'Failed services', values.failed_services === '0' ? 'pass' : 'warn', 'rhel', values.failed_services === '0' ? 'None' : `${values.failed_services || 'Unknown'} failed`),
      ]
      const offset = Number.parseFloat(values.clock_offset || '')
      rhel.push(Number.isFinite(offset)
        ? check('clock', 'Clock (chrony)', Math.abs(offset) <= 2 ? 'pass' : 'warn', 'rhel', `${offset >= 0 ? '+' : ''}${offset.toFixed(3)} s from NTP`)
        : check('clock', 'Clock (chrony)', 'unknown', 'rhel', 'Offset unavailable'))
      const root = parseRootFs(values.root_fs)
      rhel.push(root
        ? check('root-fs', 'Root filesystem', root.usedPercent < 85 ? 'pass' : 'warn', 'rhel', `${(root.bytes / 1024 ** 3).toFixed(1)} GB, ${root.usedPercent}% used`)
        : check('root-fs', 'Root filesystem', 'unknown', 'rhel', 'Size unavailable'))
      rhel.push(baselineCheck(values.baseline, baselineDigest))
      const base = { reachable: true, release: values.release || null, rhel, rootBytes: root?.bytes ?? null }
      if (!isVaultRole(role)) {
        return { ...base, vault: serviceEvidence(values), facts: NO_FACTS, ...(role === 'proxy' ? { frontDoor: parseFrontDoor(values.front_door) } : {}) }
      }
      const vault = vaultEvidence(role, values)
      return { ...base, vault: vault.checks, facts: vault.facts }
    } catch {
      return {
        reachable: false,
        release: null,
        rhel: [check('rhel-reachable', 'Guest checks', 'fail', 'rhel', 'The guest did not answer the fixed read-only probe.')],
        vault: [check('vault-reachable', isVaultRole(role) ? 'Vault health' : 'Service health', 'fail', isVaultRole(role) ? 'vault' : 'rhel', 'The guest did not answer the fixed read-only probe.')],
        facts: NO_FACTS,
        rootBytes: null,
      }
    }
  })
}

function fromReport(items: ReportCheck[], scope: EvidenceCheck['scope'], at: string): EvidenceCheck[] {
  return items.map(item => check(`report-${scope}-${item.id}`, item.label, item.status, 'vault', item.detail, scope, at))
}

/**
 * Cluster and seal-chain evidence from the last `make validate` run. The UI
 * never runs Ansible; it shows the report with its age, and a missing or
 * stale report is never treated as passing.
 */
export function reportEvidence(report: ValidationReport, now = Date.now()): { cluster: EvidenceCheck[], sealChain: EvidenceCheck[], identity: EvidenceCheck[], frontDoor: EvidenceCheck[] } {
  if (!report.readable || !report.generatedAt) {
    const missing = check('report-missing', 'Validation report', 'unknown', 'ansible', 'No .build/validation.json yet — run make validate.', 'cluster')
    return { cluster: [missing], sealChain: [{ ...missing, scope: 'seal-chain' }], identity: [{ ...missing, scope: 'identity' }], frontDoor: [{ ...missing, scope: 'front-door' }] }
  }
  const at = report.generatedAt
  const ageMs = now - Date.parse(at)
  const minutes = Math.max(0, Math.round(ageMs / 60_000))
  const age = minutes < 90 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`
  const freshness = check('report-age', 'Validation report age', ageMs <= REPORT_MAX_AGE_MS ? 'pass' : 'warn', 'ansible', `make validate ran ${age}`, 'cluster', at)
  return {
    cluster: [freshness, ...fromReport(report.cluster, 'cluster', at)],
    sealChain: [{ ...freshness, id: 'report-age-seal', scope: 'seal-chain' }, ...fromReport(report.sealChain, 'seal-chain', at)],
    identity: report.identity.length ? [{ ...freshness, id: 'report-age-identity', scope: 'identity' }, ...fromReport(report.identity, 'identity', at)] : [],
    frontDoor: report.frontDoor.length ? [{ ...freshness, id: 'report-age-front-door', scope: 'front-door' }, ...fromReport(report.frontDoor, 'front-door', at)] : [],
  }
}
