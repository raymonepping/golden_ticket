import { authConfig, getAuthSession, isPublicPath } from '../utils/auth'

// Every API route needs a session when auth is on; a required-but-missing
// identity configuration fails closed instead of serving data.
export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') || isPublicPath(path)) return
  const config = authConfig()
  if (!config.enabled) {
    if (config.required) throw createError({ statusCode: 503, statusMessage: 'Sign-in is required but identity is not configured.' })
    return
  }
  const session = await getAuthSession(event)
  if (!session.data.user) throw createError({ statusCode: 401, statusMessage: 'Sign in first.' })
})
