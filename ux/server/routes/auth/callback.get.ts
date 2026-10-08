import { authConfig, clientSecret, discovery, getAuthSession, roleFromGroups, verifyIdToken } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const config = authConfig()
  if (!config.enabled) return sendRedirect(event, '/')
  const query = getQuery(event)
  const session = await getAuthSession(event)
  const pending = session.data.pending
  const fail = async (reason: string) => {
    await session.update({ pending: undefined, user: undefined })
    return sendRedirect(event, `/signin?error=${encodeURIComponent(reason)}`)
  }
  if (!pending || typeof query.state !== 'string' || query.state !== pending.state || typeof query.code !== 'string') {
    return fail('The sign-in response did not match this browser session.')
  }
  try {
    const { value } = await discovery(config.issuer)
    const tokens = await $fetch<{ id_token?: string }>(value.token_endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'authorization': `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(clientSecret())}`).toString('base64')}`,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: query.code, redirect_uri: `${pending.origin}/auth/callback`, code_verifier: pending.verifier }).toString(),
    })
    if (!tokens.id_token) return fail('Keycloak returned no identity token.')
    const claims = await verifyIdToken(tokens.id_token, config, pending.nonce)
    const role = roleFromGroups(claims.groups)
    if (!role) return fail('Your account is not in a golden_ticket group.')
    const name = typeof claims.preferred_username === 'string' ? claims.preferred_username : String(claims.sub)
    await session.update({ pending: undefined, user: { name, role } })
    return sendRedirect(event, '/')
  } catch (error) {
    // Cause only (class, status, message); never tokens or secrets.
    const detail = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : 'unknown error'
    console.error(`[auth] sign-in callback failed — ${detail}`)
    return fail('Sign-in could not be completed.')
  }
})
