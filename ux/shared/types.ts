export type EvidenceStatus = 'pass' | 'warn' | 'fail' | 'unknown'
export type EvidenceScope = 'node' | 'cluster' | 'seal-chain' | 'identity' | 'front-door'
export type EvidenceSource = 'multipass' | 'terraform' | 'ansible' | 'rhel' | 'vault'
/** The fourth posture slot is `vault` on Vault nodes and `service` on service VMs. */
export type PostureKind = 'provisioned' | 'rhel' | 'ansible' | 'vault' | 'service'
/** Role of a golden_ticket node per Terraform's lab_nodes contract; null for any other VM. */
export type LabRole = 'seal' | 'leader' | 'follower' | 'ux' | 'identity' | 'proxy' | 'agent'
export type VaultRole = Extract<LabRole, 'seal' | 'leader' | 'follower'>
export type LabMode = 'host' | 'vm'

export interface EvidenceCheck {
  id: string
  label: string
  status: EvidenceStatus
  scope: EvidenceScope
  source: EvidenceSource
  detail: string
  observedAt: string
}

export interface PostureCategory {
  kind: PostureKind
  label: string
  status: string
  tone: 'positive' | 'warning' | 'critical' | 'neutral'
  evidence: EvidenceCheck[]
}

export interface InstanceResources {
  cpus: number | null
  memoryBytes: number | null
  diskBytes: number | null
}

export interface InstanceSummary {
  name: string
  state: string
  ipv4: string[]
  release: string | null
  imageHash: string | null
  resources: InstanceResources
  snapshotCount: number | null
  deleted: boolean
  labRole: LabRole | null
  /** provisioned → rhel → ansible → vault|service (fourth slot keyed `vault`). */
  posture: { provisioned: PostureCategory, rhel: PostureCategory, ansible: PostureCategory, vault: PostureCategory }
}

export interface EnvironmentSummary {
  total: number
  running: number
  stopped: number
  deleted: number
  cpus: number
  memoryBytes: number
}

/** One edge of the seal chain: the seal Vault feeding a cluster node. */
export interface SealLink {
  node: string
  sealType: string | null
  sealed: boolean | null
  status: EvidenceStatus
  detail: string
}

export interface SealChain {
  sealNode: string
  sealVault: { status: EvidenceStatus, sealed: boolean | null, detail: string }
  /** The seal agent between the seal Vault and the cluster (prompt 09), if any. */
  agent: { node: string, status: EvidenceStatus, detail: string } | null
  links: SealLink[]
}

/** One public entry point of the front door and its live backends. */
export interface FrontDoorEntry {
  key: string
  label: string
  url: string
  /** STANDBY: a Vault node that is healthy but not active (writes go to the leader only). */
  servers: { name: string, status: 'UP' | 'STANDBY' | 'DOWN' | 'MAINT' | 'UNKNOWN' }[]
}

export interface FrontDoor {
  node: string
  entries: FrontDoorEntry[]
}

export interface InstancesResponse {
  mode: LabMode
  available: boolean
  message: string | null
  observedAt: string
  summary: EnvironmentSummary
  instances: InstanceSummary[]
  cluster: EvidenceCheck[]
  sealChain: SealChain | null
  frontDoor: FrontDoor | null
}

export interface InstanceDetailResponse {
  mode: LabMode
  available: boolean
  message: string | null
  observedAt: string
  instance: InstanceSummary | null
  cluster: EvidenceCheck[]
  sealChain: SealChain | null
  frontDoor: FrontDoor | null
}

export type InstanceAction = 'start' | 'stop' | 'restart' | 'suspend' | 'delete' | 'recover'

export interface ActionRequest {
  confirm?: boolean
  acknowledgeOwnershipDrift?: boolean
}

export interface ActionResponse {
  ok: boolean
  action: InstanceAction | 'purge'
  message: string
  instance?: InstanceSummary | null
}

export type UserRole = 'viewer' | 'operator' | 'admin'

/** What the BFF tells the browser about the person. Never a token. */
export interface SessionInfo {
  authEnabled: boolean
  authRequired: boolean
  authenticated: boolean
  user: string | null
  role: UserRole | null
}

/** One secrets engine as Vault reports it in the engines namespace. */
export interface EngineMount {
  path: string
  type: string
  description: string
  pluginVersion: string | null
}

/**
 * live:         Vault answered; engines is exactly what it reported.
 * unreachable:  no answer from Vault (network, TLS, sealed, 5xx).
 * denied:       Vault refused the console's token (expired or revoked).
 * unconfigured: the console has no Vault address or token (make ux).
 */
export type EnginesState = 'live' | 'unreachable' | 'denied' | 'unconfigured'

export interface EnginesResponse {
  state: EnginesState
  namespace: string | null
  checkedAt: string
  engines: EngineMount[]
}

/** An engine Terraform deliberately did not mount, with Terraform's reason. */
export interface EngineSkipped {
  path: string
  reason: string
}

/** terraform/platform's `engines` output: what it mounts and why the rest is not. */
export interface EnginesPlan {
  readable: boolean
  namespace: string | null
  mounted: string[]
  skipped: EngineSkipped[]
}

export type LayerTool = 'terraform' | 'ansible'
export type GateName = 'idempotency' | 'drift' | 'secret-scan' | 'validation'

/** One row of .build/layers.json: a phase of scripts/phases.txt and its evidence. */
export interface LayerRow {
  phase: string
  tool: LayerTool
  /** Terraform: managed resources in state. */
  resources: number | null
  lastApply: { result: string, at: string } | null
  lastPlan: { result: 'clean' | 'drift' | 'error' | 'unknown', at: string } | null
  /** Ansible: the last real run and the last check-mode run (counts only). */
  lastRun: { at: string, changed: number, failed: number } | null
  lastCheck: { at: string, changed: number } | null
  /** Ansible: why this phase may report changes on a converged lab (scripts/idempotency-allow.txt), else null. */
  allowedChanges: string | null
}

export interface LayerGate {
  name: GateName
  result: 'pass' | 'fail' | 'unknown'
  at: string | null
}

export interface LayersResponse {
  readable: boolean
  generatedAt: string | null
  phases: LayerRow[]
  gates: LayerGate[]
  /** Automation digest of the last successful make lab vs the code as it is now. */
  digest: { applied: string | null, current: string | null }
}
