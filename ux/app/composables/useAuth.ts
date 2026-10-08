import type { SessionInfo, UserRole } from '../../shared/types'

const RANK: Record<UserRole, number> = { viewer: 1, operator: 2, admin: 3 }

/** The signed-in person, as the BFF reports it (no tokens ever reach here). */
export function useAuth() {
  const session = useState<SessionInfo | null>('session', () => null)

  async function load(force = false) {
    if (session.value && !force) return session.value
    try {
      session.value = await $fetch<SessionInfo>('/api/session')
    } catch {
      session.value = { authEnabled: true, authRequired: true, authenticated: false, user: null, role: null }
    }
    return session.value
  }

  /** With auth off (host console on loopback) every action is allowed. */
  const can = (needed: UserRole) => computed(() => {
    const value = session.value
    if (!value || !value.authEnabled) return !value?.authRequired
    return !!value.role && RANK[value.role] >= RANK[needed]
  })

  return { session, load, can }
}
