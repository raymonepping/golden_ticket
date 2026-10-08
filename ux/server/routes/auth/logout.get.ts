import { authConfig, discovery, getAuthSession } from '../../utils/auth'
import { allowedOrigins } from '../../utils/security'

export default defineEventHandler(async (event) => {
  const config = authConfig()
  const session = config.enabled ? await getAuthSession(event) : null
  await session?.clear()
  if (!config.enabled) return sendRedirect(event, '/')
  const origin = getRequestURL(event).origin
  const { value } = await discovery(config.issuer)
  if (!value.end_session_endpoint || !allowedOrigins().includes(origin)) return sendRedirect(event, '/signin')
  const url = new URL(value.end_session_endpoint)
  url.search = new URLSearchParams({ client_id: config.clientId, post_logout_redirect_uri: `${origin}/signin` }).toString()
  return sendRedirect(event, url.toString())
})
