import { describe, expect, it } from 'vitest'
import { assertDeleteConfirmation, assertPurgeConfirmation } from '../server/utils/confirmation'
import { publicError } from '../server/utils/command'

describe('destructive confirmation', () => {
  it('requires ownership-drift acknowledgement for an Ansible-provisioned delete', () => expect(() => assertDeleteConfirmation(true, true, false)).toThrow(/drift/i))
  it('allows an explicitly acknowledged delete', () => expect(() => assertDeleteConfirmation(true, true, true)).not.toThrow())
  it('requires the exact purge phrase', () => expect(() => assertPurgeConfirmation('purge deleted instances')).toThrow())
})

describe('ownership confirmation', () => {
  it('needs no acknowledgement for a VM Ansible does not own', () => expect(() => assertDeleteConfirmation(true, false, false)).not.toThrow())
  it('always needs explicit confirmation', () => expect(() => assertDeleteConfirmation(false, false, true)).toThrow())
})

describe('public error redaction', () => {
  it('does not return arbitrary command output', () => {
    const secret = 'root-token-value'
    expect(publicError(new Error(`failed: ${secret}`), 'Operation failed.')).toBe('Operation failed.')
  })
})
