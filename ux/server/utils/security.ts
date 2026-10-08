import { assertValidName } from './multipass'

type HeaderEvent = Parameters<typeof getHeader>[0]

const LOOPBACK = ['127.0.0.1', 'localhost', '::1']

/** Origins allowed besides loopback, e.g. the VM or proxy URL (exact match). */
export function allowedOrigins(env = process.env.GT_ALLOWED_ORIGINS): string[] {
  return (env || '').split(',').map(item => item.trim().replace(/\/$/, '')).filter(item => /^https?:\/\/[^/\s]+$/.test(item))
}

export function originAllowed(origin: string, host: string, extra: string[]): boolean {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  if (extra.includes(parsed.origin)) return true
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '')
  return LOOPBACK.includes(hostname) && parsed.host === host
}

export function assertLocalOrigin(event: HeaderEvent): void {
  const origin = getHeader(event, 'origin')
  const host = getHeader(event, 'host')
  if (!origin || !host) throw createError({ statusCode: 403, statusMessage: 'An Origin header is required.' })
  if (!originAllowed(origin, host, allowedOrigins())) {
    throw createError({ statusCode: 403, statusMessage: 'Mutating requests must originate from this application.' })
  }
}

/** Reject an unsafe instance name with a 400 instead of an unhandled error. */
export function requireValidName(name: string): void {
  try {
    assertValidName(name)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid instance name.' })
  }
}
