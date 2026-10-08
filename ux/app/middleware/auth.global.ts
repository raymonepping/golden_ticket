// Send people to the sign-in page when the console requires a session.
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server || to.path === '/signin') return
  const { load } = useAuth()
  const session = await load()
  if ((session.authEnabled || session.authRequired) && !session.authenticated) return navigateTo('/signin')
})
