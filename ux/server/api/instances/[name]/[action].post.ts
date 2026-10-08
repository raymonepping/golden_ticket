import { operationMessage } from '../../../utils/operation-message'
import type { ActionRequest, ActionResponse, InstanceAction } from '../../../../shared/types'

export default defineEventHandler(async (event): Promise<ActionResponse> => {
  assertHostMode()
  assertLocalOrigin(event)
  const name = getRouterParam(event, 'name') || ''
  const action = getRouterParam(event, 'action') || ''
  await requireRole(event, requiredRole(action))
  requireValidName(name)
  if (!INSTANCE_ACTIONS.includes(action as InstanceAction) || action === 'delete') {
    throw createError({ statusCode: 404, statusMessage: 'Unsupported instance action.' })
  }
  const body = await readBody<ActionRequest>(event)
  try {
    assertInstanceConfirmation(body?.confirm)
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Explicit confirmation is required.' })
  }

  const before = await getControlPlane()
  if (!before.available || !before.instances.some(item => item.name === name)) {
    throw createError({ statusCode: 404, statusMessage: 'Instance not found in the latest Multipass list.' })
  }
  // Command result and readiness are reported separately. `multipass restart`
  // can exit non-zero after the guest has already rebooted (its own SSH
  // session drops), so a failure is reported with the refreshed posture
  // instead of being assumed fatal.
  let commandOk = true
  try {
    await exclusive(name, async () => runInstanceAction(name, action as InstanceAction))
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    commandOk = false
  }
  invalidate()
  const after = await getControlPlane()
  const instance = after.instances.find(item => item.name === name) || null
  const message = commandOk
    ? operationMessage(action as InstanceAction, instance)
    : `Multipass reported an error for ${action}. Current state: ${instance?.state ?? 'unknown'}; posture was refreshed — check it before retrying.`
  return { ok: commandOk, action: action as InstanceAction, message, instance }
})
