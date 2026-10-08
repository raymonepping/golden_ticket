/** Load the control plane (fast list first, then posture) and keep it fresh while the page is open. */
export function usePlaneLive() {
  const config = useRuntimeConfig()
  const live = usePlane()
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(async () => {
    if (!live.plane.value) await live.refresh(false)
    void live.refresh()
    timer = setInterval(() => live.refresh(), Number(config.public.refreshSeconds) * 1000)
  })
  onBeforeUnmount(() => clearInterval(timer))
  return live
}
