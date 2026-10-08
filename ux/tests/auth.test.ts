import { afterEach, describe, expect, it } from 'vitest'
import { authConfig, hasRole, isPublicPath, pkceChallenge, requiredRole, roleFromGroups } from '../server/utils/auth'

afterEach(() => {
  delete process.env.GT_MODE
  delete process.env.GT_OIDC_ISSUER
  delete process.env.GT_AUTH_REQUIRED
})

describe('claim → role mapping', () => {
  it('maps directory groups to UI roles', () => {
    expect(roleFromGroups(['gt-viewers'])).toBe('viewer')
    expect(roleFromGroups(['/gt-operators'])).toBe('operator')
  })
  it('takes the highest role', () => expect(roleFromGroups(['gt-viewers', 'gt-admins'])).toBe('admin'))
  it('grants nothing for unknown or malformed claims', () => {
    expect(roleFromGroups(['other'])).toBeNull()
    expect(roleFromGroups('gt-admins')).toBeNull()
    expect(roleFromGroups([{ name: 'gt-admins' }])).toBeNull()
  })
})

describe('role gate', () => {
  it('lets operators restart but not delete', () => {
    expect(hasRole('operator', requiredRole('restart'))).toBe(true)
    expect(hasRole('operator', requiredRole('delete'))).toBe(false)
  })
  it('viewers can do nothing mutating', () => expect(hasRole('viewer', requiredRole('start'))).toBe(false))
  it('unknown actions need admin', () => expect(requiredRole('purge')).toBe('admin'))
  it('no role means no access', () => expect(hasRole(null, 'viewer')).toBe(false))
})

describe('session guard', () => {
  it('keeps only health and session public', () => {
    expect(isPublicPath('/api/health')).toBe(true)
    expect(isPublicPath('/api/session')).toBe(true)
    expect(isPublicPath('/api/instances')).toBe(false)
  })
  it('requires sign-in in VM mode even without identity (fails closed)', () => {
    process.env.GT_MODE = 'vm'
    expect(authConfig()).toMatchObject({ enabled: false, required: true })
  })
  it('keeps the loopback host console open when identity is not configured', () => expect(authConfig()).toMatchObject({ enabled: false, required: false }))
})

describe('PKCE', () => {
  it('derives the S256 challenge (fixture computed independently with openssl)', () => {
    expect(pkceChallenge('gt-pkce-fixture-verifier-0123456789abcdef')).toBe('1sVCuZvs_3-7WK8hok3daJBvLj7IKQ2V-At3XtlzKSk')
  })
  it('is unpadded base64url of a 32-byte digest', () => expect(pkceChallenge('x')).toMatch(/^[A-Za-z0-9_-]{43}$/))
})
