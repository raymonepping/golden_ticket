import type { InstancesResponse } from '../../shared/types'

/**
 * One shared, client-side view of the control plane so the topbar pill and
 * the pages read the same observation. The fast (deep=false) list renders
 * first; posture checks follow.
 */
export function usePlane() {
  const plane = useState<InstancesResponse | null>('plane', () => null)
  const checking = useState<boolean>('plane-checking', () => false)
  const failed = useState<boolean>('plane-failed', () => false)

  async function refresh(deep = true) {
    if (checking.value && deep) return
    if (deep) checking.value = true
    try {
      const next = await $fetch<InstancesResponse>(`/api/instances${deep ? '' : '?deep=false'}`)
      // Never let a shallow list overwrite deeper evidence already shown.
      if (deep || !plane.value) plane.value = next
      failed.value = false
    } catch (error) {
      if ((error as { statusCode?: number }).statusCode === 401) {
        await navigateTo('/signin')
        return
      }
      failed.value = true
    } finally {
      if (deep) checking.value = false
    }
  }

  return { plane, checking, failed, refresh }
}
