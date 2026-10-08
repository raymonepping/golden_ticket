import { describe, expect, it } from 'vitest'
import { engineStateFor, enginesConfig, parseMounts } from '../server/utils/engines'

const mounts = {
  request_id: 'x',
  data: {
    'sys/': { type: 'ns_system', description: 'system endpoints' },
    'cubbyhole/': { type: 'ns_cubbyhole' },
    'identity/': { type: 'ns_identity' },
    'agent-registry/': { type: 'ns_agent_registry' },
    'transit/': { type: 'transit', description: 'Encryption as a service', running_plugin_version: 'v2.1.0+builtin.vault', accessor: 'transit_abc', uuid: 'u' },
    'kv/': { type: 'kv', description: 'Key/Value v2', options: { version: '2' }, running_plugin_version: 'v0.26.3-0.20260626165612-824fb96aa7a8+builtin' },
    'kmip/': { type: 'kmip', running_plugin_version: '<script>' },
    '../evil/': { type: 'kv' },
    'odd/': { type: 'Not A Type' },
  },
}

describe('engines from sys/mounts', () => {
  const engines = parseMounts(mounts)
  it('drops built-ins and malformed entries, sorts by path', () => expect(engines.map(e => e.path)).toEqual(['kmip', 'kv', 'transit']))
  it('returns only the allow-listed fields', () => expect(Object.keys(engines[2]!).sort()).toEqual(['description', 'path', 'pluginVersion', 'type']))
  it('keeps a real plugin version and rejects a hostile one', () => {
    expect(engines[2]!.pluginVersion).toBe('v2.1.0+builtin.vault')
    expect(engines[0]!.pluginVersion).toBeNull()
  })
  it('treats an empty or broken response as no engines', () => {
    expect(parseMounts(null)).toEqual([])
    expect(parseMounts({ data: {} })).toEqual([])
    expect(parseMounts('nope')).toEqual([])
  })
})

describe('engines state', () => {
  it('is live only on 200', () => expect(engineStateFor(200)).toBe('live'))
  it('is denied on 401/403', () => expect([401, 403].map(engineStateFor)).toEqual(['denied', 'denied']))
  it('is unreachable on sealed, errors or no answer', () => expect([503, 500, 429, null].map(engineStateFor)).toEqual(['unreachable', 'unreachable', 'unreachable', 'unreachable']))
})

describe('engines configuration', () => {
  const env = { GT_VAULT_ADDR: 'https://192.168.252.16:8202', GT_ENGINES_NAMESPACE: 'engines', GT_ENGINES_TOKEN_FILE: '/etc/gt-ux/engines-token' }
  it('accepts the deployed values', () => expect(enginesConfig(env)).toEqual({ addr: 'https://192.168.252.16:8202', namespace: 'engines', tokenFile: '/etc/gt-ux/engines-token' }))
  it('refuses plain http, credentials in the URL and a path', () => {
    expect(enginesConfig({ ...env, GT_VAULT_ADDR: 'http://192.168.252.16:8202' }).addr).toBeNull()
    expect(enginesConfig({ ...env, GT_VAULT_ADDR: 'https://u:p@192.168.252.16:8202' }).addr).toBeNull()
    expect(enginesConfig({ ...env, GT_VAULT_ADDR: 'https://192.168.252.16:8202/v1' }).addr).toBeNull()
  })
  it('refuses a namespace that is not a plain name', () => expect(enginesConfig({ ...env, GT_ENGINES_NAMESPACE: '../root' }).namespace).toBeNull())
  it('refuses a relative token path', () => expect(enginesConfig({ ...env, GT_ENGINES_TOKEN_FILE: 'engines-token' }).tokenFile).toBeNull())
  it('is unconfigured when nothing is set', () => expect(enginesConfig({})).toEqual({ addr: null, namespace: null, tokenFile: null }))
})
