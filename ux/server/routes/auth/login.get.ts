import { authConfig, discovery, getAuthSession, pkceChallenge, randomToken } from '../../utils/auth'
import { allowedOrigins } from '../../utils/security'

export default defineEventHandler(async (event) => {
  const config = authConfig()
  if (!config.enabled) return sendRedirect(event, '/')
  // The callback must return to an origin Keycloak knows (allow-listed).
  const origin = getRequestURL(event).origin
  if (!allowedOrigins().includes(origin)) throw createError({ statusCode: 400, statusMessage: 'Unknown console origin.' })
  const { value } = await discovery(config.issuer)
  const pending = { state: randomToken(), nonce: randomToken(), verifier: randomToken(), origin }
  const session = await getAuthSession(event)
  await session.update({ pending, user: undefined })
  const url = new URL(value.authorization_endpoint)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: `${origin}/auth/callback`,
    scope: 'openid profile email',
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: pkceChallenge(pending.verifier),
    code_challenge_method: 'S256',
  }).toString()
  return sendRedirect(event, url.toString())
})
