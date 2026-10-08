// Cheap unauthenticated liveness for probes and the front-door proxy.
export default defineEventHandler(() => ({ ok: true }))
