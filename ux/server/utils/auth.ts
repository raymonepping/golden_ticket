import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { UserRole } from '../../shared/types'
import { labMode } from './mode'
type H3Event = Parameters<typeof getHeader>[0]

/*
 * OIDC (Authorization Code + PKCE) against the lab's Keycloak, done entirely
 * in the Nitro server. The browser only ever holds an encrypted, httpOnly
 * session cookie with the person's name and role — never a token.
 */

export const ROLE_RANK: Record<UserRole, number> = { viewer: 1, operator: 2, admin: 3 }

/** What each lifecycle action needs. Unknown actions need admin. */
export function requiredRole(action: string): UserRole {
  return ['start', 'restart', 'stop', 'suspend'].includes(action) ? 'operator' : 'admin'
}

export function hasRole(role: UserRole | null | undefined, needed: UserRole): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[needed]
}

/** Highest role granted by the groups claim (`a=admin,b=operator,...`). */
export function roleFromGroups(groups: unknown, mapping = process.env.GT_GROUP_ROLES || 'gt-admins=admin,gt-operators=operator,gt-viewers=viewer'): UserRole | null {
  if (!Array.isArray(groups)) return null
  const table = new Map(mapping.split(',').map(pair => pair.trim().split('=') as [string, string]))
  let best: UserRole | null = null
  for (const group of groups) {
    if (typeof group !== 'string') continue
    const role = table.get(group.replace(/^\//, '')) as UserRole | undefined
    if (role && ROLE_RANK[role] && (!best || ROLE_RANK[role] > ROLE_RANK[best])) best = role
  }
  return best
}

/** API paths that work without a session. */
export function isPublicPath(path: string): boolean {
  return path === '/api/health' || path === '/api/session'
}

export interface AuthConfig {
  enabled: boolean
  required: boolean
  issuer: string
  clientId: string
}

export function authConfig(): AuthConfig {
  const issuer = (process.env.GT_OIDC_ISSUER || '').replace(/\/$/, '')
  // In VM mode the console is reachable from the network: no bypass.
  const required = labMode() === 'vm' || process.env.GT_AUTH_REQUIRED === 'true'
  return { enabled: !!issuer, required, issuer, clientId: process.env.GT_OIDC_CLIENT_ID || 'gt-ui' }
}

function secretFile(env: string): string {
  const path = process.env[env]
  if (!path) throw new Error(`${env} is not set`)
  return readFileSync(path, 'utf8').trim()
}

interface SessionData {
  user?: { name: string, role: UserRole }
  pending?: { state: string, nonce: string, verifier: string, origin: string }
}

export function getAuthSession(event: H3Event) {
  const password = secretFile('GT_SESSION_SECRET_FILE')
  return useSession<SessionData>(event, {
    password,
    name: 'gt_session',
    maxAge: 8 * 60 * 60,
    cookie: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
  })
}

interface Discovery { authorization_endpoint: string, token_endpoint: string, jwks_uri: string, end_session_endpoint?: string, issuer: string }
let discoveryCache: { issuer: string, value: Discovery, jwks: ReturnType<typeof createRemoteJWKSet> } | null = null

export async function discovery(issuer: string) {
  if (discoveryCache?.issuer === issuer) return discoveryCache
  const value = await $fetch<Discovery>(`${issuer}/.well-known/openid-configuration`)
  if (value.issuer !== issuer) throw new Error('Issuer mismatch in discovery document')
  discoveryCache = { issuer, value, jwks: createRemoteJWKSet(new URL(value.jwks_uri)) }
  return discoveryCache
}

const b64url = (buffer: Buffer) => buffer.toString('base64url')
export const randomToken = () => b64url(randomBytes(32))
export const pkceChallenge = (verifier: string) => b64url(createHash('sha256').update(verifier).digest())

export async function verifyIdToken(idToken: string, config: AuthConfig, nonce: string) {
  const { jwks } = await discovery(config.issuer)
  const { payload } = await jwtVerify(idToken, jwks, { issuer: config.issuer, audience: config.clientId, algorithms: ['RS256', 'PS256', 'ES256'] })
  if (payload.nonce !== nonce) throw new Error('nonce mismatch')
  return payload
}

export function clientSecret(): string {
  return secretFile('GT_OIDC_CLIENT_SECRET_FILE')
}

/** Throws 401/403 unless the session's role suffices. No-op when auth is off. */
export async function requireRole(event: H3Event, needed: UserRole): Promise<void> {
  const config = authConfig()
  if (!config.enabled && !config.required) return
  const session = await getAuthSession(event)
  if (!session.data.user) throw createError({ statusCode: 401, statusMessage: 'Sign in first.' })
  if (!hasRole(session.data.user.role, needed)) {
    throw createError({ statusCode: 403, statusMessage: `This needs the ${needed} role.` })
  }
}
