import type { ActionRequest, ActionResponse } from '../../../shared/types'

export default defineEventHandler(async (event): Promise<ActionResponse> => {
  assertHostMode()
  assertLocalOrigin(event)
  await requireRole(event, 'admin')
  const name = getRouterParam(event, 'name') || ''
  requireValidName(name)
  const body = await readBody<ActionRequest>(event)
  const before = await getControlPlane()
  const instance = before.instances.find(item => item.name === name)
  if (!before.available || !instance) throw createError({ statusCode: 404, statusMessage: 'Instance not found in the latest Multipass list.' })
  try {
    assertDeleteConfirmation(body?.confirm, instance.labRole !== null, body?.acknowledgeOwnershipDrift)
  } catch (error) {
    throw createError({ statusCode: 409, statusMessage: error instanceof Error ? error.message : 'Delete confirmation is required.' })
  }
  await exclusive(name, async () => runInstanceAction(name, 'delete'))
  invalidate()
  return { ok: true, action: 'delete', message: 'Instance moved to Multipass trash and remains recoverable.' }
})
