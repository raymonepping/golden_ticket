// Read-only: what terraform/platform mounts in the engines namespace and why
// it skips the rest (Terraform's `engines` output, via .build/engines.json).
export default defineEventHandler(() => loadEnginesPlan(repositoryRoot()))
