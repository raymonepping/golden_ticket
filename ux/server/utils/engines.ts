import { readFile } from 'node:fs/promises'
import type { EngineMount, EnginesResponse, EnginesState } from '../../shared/types'
import { cached } from './cache'

/*
 * Read-only view of the secrets engines in one Vault namespace. The console's
 * token (policy gt-ui-engines) can read engines/sys/mounts and nothing
 * else; it is read from a file per request and never logged or returned.
 */

// Mounts Vault creates itself, in the root namespace and in children.
const BUILTIN_TYPES = new Set([
  'system', 'identity', 'cubbyhole', 'agent_registry',
  'ns_system', 'ns_identity', 'ns_cubbyhole', 'ns_agent_registry',
])
const NAMESPACE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MOUNT_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}\/$/
const TYPE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const VERSION = /^v?[0-9A-Za-z.+_-]{1,96}$/

type UnknownRecord = Record<string, unknown>
const record = (value: unknown): UnknownRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}

/** Allow-listed engines from a sys/mounts response, built-ins dropped, sorted by path. */
export function parseMounts(raw: unknown): EngineMount[] {
  const root = record(raw)
  const data = Object.keys(record(root.data)).length > 0 ? record(root.data) : root
  const engines: EngineMount[] = []
  for (const [path, value] of Object.entries(data)) {
    const mount = record(value)
    const type = mount.type
    if (!MOUNT_PATH.test(path) || typeof type !== 'string' || !TYPE.test(type) || BUILTIN_TYPES.has(type)) continue
    const version = mount.running_plugin_version
    engines.push({
      path: path.slice(0, -1),
      type,
      description: typeof mount.description === 'string' ? mount.description.slice(0, 160) : '',
      pluginVersion: typeof version === 'string' && VERSION.test(version) ? version : null,
    })
  }
  return engines.sort((a, b) => a.path.localeCompare(b.path))
}

/** Vault's HTTP status (or none) to the page's state. */
export function engineStateFor(status: number | null): EnginesState {
  if (status === 200) return 'live'
  if (status === 401 || status === 403) return 'denied'
  return 'unreachable'
}

export interface EnginesConfig { addr: string | null, namespace: string | null, tokenFile: string | null }

export function enginesConfig(env: NodeJS.ProcessEnv = process.env): EnginesConfig {
  let addr: string | null = null
  try {
    const url = new URL(env.GT_VAULT_ADDR ?? '')
    if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/') addr = url.origin
  } catch { addr = null }
  const namespace = NAMESPACE.test(env.GT_ENGINES_NAMESPACE ?? '') ? env.GT_ENGINES_NAMESPACE! : null
  const tokenFile = env.GT_ENGINES_TOKEN_FILE?.startsWith('/') ? env.GT_ENGINES_TOKEN_FILE : null
  return { addr, namespace, tokenFile }
}

async function readToken(path: string): Promise<string | null> {
  try {
    const token = (await readFile(path, 'utf8')).trim()
    return /^[A-Za-z0-9._-]{8,256}$/.test(token) ? token : null
  } catch {
    return null
  }
}

async function loadEngines(config: EnginesConfig): Promise<EnginesResponse> {
  const checkedAt = new Date().toISOString()
  const empty = (state: EnginesState): EnginesResponse => ({ state, namespace: config.namespace, checkedAt, engines: [] })
  if (!config.addr || !config.namespace || !config.tokenFile) return empty('unconfigured')
  const token = await readToken(config.tokenFile)
  if (!token) return empty('unconfigured')
  try {
    const response = await fetch(`${config.addr}/v1/sys/mounts`, {
      headers: { 'X-Vault-Token': token, 'X-Vault-Namespace': config.namespace },
      signal: AbortSignal.timeout(4000),
      redirect: 'error',
    })
    const state = engineStateFor(response.status)
    if (state !== 'live') return empty(state)
    return { state, namespace: config.namespace, checkedAt, engines: parseMounts(await response.json()) }
  } catch {
    return empty('unreachable')
  }
}

/** What Vault reports now (10 s cache, so a page refresh never hammers Vault). */
export function getEngines(): Promise<EnginesResponse> {
  return cached('engines', 10_000, () => loadEngines(enginesConfig()))
}
