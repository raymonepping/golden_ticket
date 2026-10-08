import type { LabMode } from '../../shared/types'

/**
 * host: runs on the Mac next to Multipass (full lifecycle control).
 * vm:   runs inside gt-ux-1; observe-only, evidence over the network.
 */
export function labMode(): LabMode {
  return process.env.GT_MODE === 'vm' ? 'vm' : 'host'
}

/** Defence in depth: lifecycle routes do not exist in VM mode. */
export function assertHostMode(): void {
  if (labMode() !== 'host') {
    throw createError({ statusCode: 405, statusMessage: 'Observe-only: lifecycle actions run from the host console (make ui-start).' })
  }
}
