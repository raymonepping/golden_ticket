import type { SessionInfo } from '../../shared/types'
import { authConfig, getAuthSession } from '../utils/auth'

export default defineEventHandler(async (event): Promise<SessionInfo> => {
  const config = authConfig()
  if (!config.enabled) return { authEnabled: false, authRequired: config.required, authenticated: false, user: null, role: null }
  const session = await getAuthSession(event)
  const user = session.data.user
  return { authEnabled: true, authRequired: config.required, authenticated: !!user, user: user?.name ?? null, role: user?.role ?? null }
})
