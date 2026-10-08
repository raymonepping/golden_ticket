import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EnginesPlan, GateName, LayerGate, LayerRow, LayersResponse } from '../../shared/types'
import { cached } from './cache'
import { labMode } from './mode'

/*
 * Read-only adapters over two non-secret evidence files:
 *   .build/layers.json   — scripts/layers.sh: one row per phase + the gates
 *   .build/engines.json  — terraform/platform `engines` output
 * Allow-listed fields only; anything else in those files is ignored.
 */

type UnknownRecord = Record<string, unknown>
const record = (value: unknown): UnknownRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const iso = (value: unknown): string | null => typeof value === 'string' && ISO.test(value) ? value : null
const count = (value: unknown): number | null => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
const PHASE = /^[a-z][a-z0-9-]{0,31}$/
const PATH = /^[a-z0-9][a-z0-9_-]{0,63}$/
const GATES: GateName[] = ['idempotency', 'drift', 'secret-scan', 'validation']

function stamped<T extends string>(value: unknown, allowed: readonly T[], fallback: T): { result: T, at: string } | null {
  const item = record(value)
  const at = iso(item.at)
  if (!at) return null
  const result = allowed.find(candidate => candidate === item.result) ?? fallback
  return { result, at }
}

export function parseLayers(raw: unknown): LayersResponse {
  const root = record(raw)
  if (raw === null || !Array.isArray(root.phases)) return { readable: false, generatedAt: null, phases: [], gates: GATES.map(name => ({ name, result: 'unknown', at: null })), digest: { applied: null, current: null } }
  const phases: LayerRow[] = root.phases.map(record).flatMap((row) => {
    const phase = typeof row.phase === 'string' && PHASE.test(row.phase) ? row.phase : null
    const tool = row.tool === 'terraform' || row.tool === 'ansible' ? row.tool : null
    if (!phase || !tool) return []
    const run = record(row.last_run)
    const chk = record(row.last_check)
    return [{
      phase,
      tool,
      resources: tool === 'terraform' ? count(row.resources) : null,
      lastApply: tool === 'terraform' ? stamped(row.last_apply, ['success'] as const, 'success') : null,
      lastPlan: tool === 'terraform' ? stamped(row.last_plan, ['clean', 'drift', 'error', 'unknown'] as const, 'unknown') : null,
      lastRun: tool === 'ansible' && iso(run.at) && count(run.changed) !== null
        ? { at: iso(run.at)!, changed: count(run.changed)!, failed: count(run.failed) ?? 0 }
        : null,
      lastCheck: tool === 'ansible' && iso(chk.at) && count(chk.changed) !== null
        ? { at: iso(chk.at)!, changed: count(chk.changed)! }
        : null,
      allowedChanges: tool === 'ansible' && typeof row.allowed_changes === 'string' ? row.allowed_changes.slice(0, 200) : null,
    }]
  })
  const gatesRaw = record(root.gates)
  const gates: LayerGate[] = GATES.map((name) => {
    const gate = record(gatesRaw[name])
    const result = gate.result === 'pass' || gate.result === 'fail' ? gate.result : 'unknown'
    return { name, result, at: iso(gate.at) }
  })
  return { readable: true, generatedAt: iso(root.generated_at), phases, gates, digest: { applied: null, current: null } }
}

export function parseEnginesPlan(raw: unknown): EnginesPlan {
  const root = record(raw)
  if (raw === null || !Array.isArray(root.mounted)) return { readable: false, namespace: null, mounted: [], skipped: [] }
  const namespace = typeof root.namespace === 'string' && PATH.test(root.namespace) ? root.namespace : null
  const mounted = root.mounted.filter((item): item is string => typeof item === 'string' && PATH.test(item))
  const skipped = Object.entries(record(root.skipped)).flatMap(([path, reason]) =>
    PATH.test(path) && typeof reason === 'string' ? [{ path, reason: reason.slice(0, 160) }] : [],
  ).sort((a, b) => a.path.localeCompare(b.path))
  return { readable: true, namespace, mounted, skipped }
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

function evidenceDir(repositoryRoot: string): string {
  return labMode() === 'vm' ? (process.env.GT_EVIDENCE_DIR || '/var/lib/gt-ux/evidence') : resolve(repositoryRoot, '.build')
}

export function loadLayers(repositoryRoot: string): Promise<LayersResponse> {
  return cached('layers', 5_000, async () => parseLayers(await readJson(resolve(evidenceDir(repositoryRoot), 'layers.json'))))
}

export function loadEnginesPlan(repositoryRoot: string): Promise<EnginesPlan> {
  return cached('engines-plan', 5_000, async () => parseEnginesPlan(await readJson(resolve(evidenceDir(repositoryRoot), 'engines.json'))))
}
