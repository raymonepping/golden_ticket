import { describe, expect, it } from 'vitest'
import { baselineCheck } from '../server/utils/checks'

const applied = 'c'.repeat(64)

describe('baseline evidence (Terraform-run ansible_playbook)', () => {
  it('passes when the node runs the baseline Terraform applied', () => {
    const result = baselineCheck(applied, applied)
    expect(result.status).toBe('pass')
    expect(result.source).toBe('terraform')
  })
  it('warns when the node runs another baseline', () => expect(baselineCheck('d'.repeat(64), applied).status).toBe('warn'))
  it('fails when the node reports none', () => expect(baselineCheck(undefined, applied).status).toBe('fail'))
  it('is unknown, never green, without the applied digest', () => expect(baselineCheck(applied, null).status).toBe('unknown'))
})
