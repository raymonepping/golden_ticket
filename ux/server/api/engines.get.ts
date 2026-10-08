// Read-only: the secrets engines Vault reports in the engines namespace.
export default defineEventHandler(() => getEngines())
