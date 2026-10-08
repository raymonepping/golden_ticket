import type { EvidenceCheck, LabRole, PostureCategory, PostureKind } from './types'

export const POSTURE_LABELS: Record<PostureKind, string> = {
  provisioned: 'Provisioned',
  rhel: 'RHEL',
  ansible: 'Ansible',
  vault: 'Vault',
  service: 'Service',
}

export const VAULT_ROLES = ['seal', 'leader', 'follower'] as const
export const isVaultRole = (role: string | null | undefined): role is typeof VAULT_ROLES[number] => VAULT_ROLES.includes(role as typeof VAULT_ROLES[number])

export function category(
  kind: PostureKind,
  status: string,
  evidence: EvidenceCheck[],
): PostureCategory {
  const tone = evidence.some(item => item.status === 'fail')
    ? 'critical'
    : evidence.some(item => item.status === 'warn')
      ? 'warning'
      : evidence.length > 0 && evidence.every(item => item.status === 'pass')
        ? 'positive'
        : 'neutral'

  return { kind, label: POSTURE_LABELS[kind], status, tone, evidence }
}

export function aggregateStatus(
  evidence: EvidenceCheck[],
  labels: { pass: string, warn: string, fail: string, unknown: string },
): string {
  if (evidence.length === 0 || evidence.some(item => item.status === 'unknown')) return labels.unknown
  if (evidence.some(item => item.status === 'fail')) return labels.fail
  if (evidence.some(item => item.status === 'warn')) return labels.warn
  return labels.pass
}

export const ROLE_LABELS: Record<LabRole, string> = {
  seal: 'Seal Vault',
  leader: 'Cluster · leader',
  follower: 'Cluster',
  ux: 'Control plane',
  identity: 'Identity',
  proxy: 'Front door',
  agent: 'Seal agent',
}

export const ROLE_DESCRIPTIONS: Record<LabRole, string> = {
  seal: 'Seal Vault · Shamir 1/1 · Transit key autounseal',
  leader: 'Cluster node · initial leader · transit seal',
  follower: 'Cluster node · transit seal',
  ux: 'Service VM · control-plane UI (observe-only VM mode)',
  identity: 'Service VM · OpenLDAP + Keycloak',
  proxy: 'Service VM · HAProxy front door',
  agent: 'Service VM · Vault Agent (AppRole) · secret-id rotator',
}
