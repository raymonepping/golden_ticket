import { afterEach, describe, expect, it } from 'vitest'
import { labMode } from '../server/utils/mode'
import { allowedOrigins, originAllowed } from '../server/utils/security'
import { parseProbe, serviceEvidence } from '../server/utils/checks'
import { isVaultRole } from '../shared/posture'

afterEach(() => { delete process.env.GT_MODE })

describe('provider selection', () => {
  it('defaults to host mode', () => expect(labMode()).toBe('host'))
  it('switches to observe-only VM mode only on the exact value', () => {
    process.env.GT_MODE = 'vm'
    expect(labMode()).toBe('vm')
    process.env.GT_MODE = 'VM; rm -rf'
    expect(labMode()).toBe('host')
  })
})

describe('origin allow-list', () => {
  const extra = allowedOrigins('https://192.168.252.20:3443, https://192.168.252.30/ ,javascript:alert(1),')
  it('parses only clean origins', () => expect(extra).toEqual(['https://192.168.252.20:3443', 'https://192.168.252.30']))
  it('accepts a configured origin exactly', () => expect(originAllowed('https://192.168.252.20:3443', 'x', extra)).toBe(true))
  it('rejects a near miss', () => expect(originAllowed('https://192.168.252.20:3444', 'x', extra)).toBe(false))
  it('accepts loopback only for its own host', () => {
    expect(originAllowed('http://127.0.0.1:3310', '127.0.0.1:3310', [])).toBe(true)
    expect(originAllowed('http://127.0.0.1:3310', 'evil:3310', [])).toBe(false)
  })
  it('rejects garbage', () => expect(originAllowed('not a url', 'x', extra)).toBe(false))
})

describe('service-node evidence', () => {
  const values = parseProbe('release=Red Hat Enterprise Linux release 9.8 (Plow)\nservice_unit=gt-ux\nservice_active=active\nservice_http=200')
  it('passes an active service answering 200', () => expect(serviceEvidence(values).every(item => item.status === 'pass')).toBe(true))
  it('fails a service that does not answer', () => expect(serviceEvidence({ ...values, service_http: '000' }).some(item => item.status === 'fail')).toBe(true))
  it('checks every unit of a multi-unit service', () => {
    const multi = serviceEvidence({ service_unit: 'keycloak,openldap', service_active: 'active,active', service_http: '200' })
    expect(multi.map(item => item.id)).toEqual(['service-unit-keycloak', 'service-unit-openldap', 'service-https'])
    expect(multi.every(item => item.status === 'pass')).toBe(true)
    expect(serviceEvidence({ service_unit: 'keycloak,openldap', service_active: 'active,failed', service_http: '200' })[1]?.status).toBe('fail')
  })
  it('never treats a service VM as a Vault node', () => {
    expect(isVaultRole('ux')).toBe(false)
    expect(isVaultRole('seal')).toBe(true)
  })
})

describe('front-door probe parsing', () => {
  it('keeps backend/server/status triples', async () => {
    const { parseFrontDoor } = await import('../server/utils/checks')
    expect(parseFrontDoor('vault_active:gt-vault-2:UP;vault_active:gt-vault-1:DOWN 1/2;ui:gt-ux-1:UP')).toEqual([
      { backend: 'vault_active', server: 'gt-vault-2', status: 'UP' },
      { backend: 'vault_active', server: 'gt-vault-1', status: 'DOWN' },
      { backend: 'ui', server: 'gt-ux-1', status: 'UP' },
    ])
  })
  it('drops malformed or hostile entries', async () => {
    const { parseFrontDoor } = await import('../server/utils/checks')
    expect(parseFrontDoor('x;;BAD NAME:a:UP;ok:srv:<script>')).toEqual([{ backend: 'ok', server: 'srv', status: 'UNKNOWN' }])
  })
})

describe('front door: standby is not down', () => {
  it('labels an unsealed non-active Vault node on the write path as standby', async () => {
    const { frontDoorFrom } = await import('../server/utils/control-plane')
    const proxy = {
      summary: { name: 'gt-proxy-1', labRole: 'proxy', ipv4: ['10.0.0.9'] },
      checks: { frontDoor: [
        { backend: 'vault_active', server: 'gt-vault-1', status: 'UP' },
        { backend: 'vault_active', server: 'gt-vault-2', status: 'DOWN' },
        { backend: 'vault_active', server: 'gt-vault-3', status: 'DOWN' },
        { backend: 'vault_any', server: 'gt-vault-1', status: 'UP' },
        { backend: 'vault_any', server: 'gt-vault-2', status: 'UP' },
        { backend: 'vault_any', server: 'gt-vault-3', status: 'DOWN' },
      ] },
    } as unknown as Parameters<typeof frontDoorFrom>[0][number]
    const write = frontDoorFrom([proxy])!.entries.find(e => e.key === 'vault')!
    expect(write.servers.map(s => s.status)).toEqual(['UP', 'STANDBY', 'DOWN'])
    expect(write.url).toBe('https://10.0.0.9:8200')
  })
})
