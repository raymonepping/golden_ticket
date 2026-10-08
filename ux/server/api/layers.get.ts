// Read-only: the phases of scripts/phases.txt (Terraform builds, Ansible
// decorates), the gates (.build/layers.json), and whether the automation has
// changed since the last successful make lab (same digest the VM indicators use).
export default defineEventHandler(async () => {
  const root = repositoryRoot()
  const [layers, repo] = await Promise.all([loadLayers(root), loadRepositoryEvidence(root)])
  return { ...layers, digest: { applied: repo.stamp.digest, current: repo.currentDigest } }
})
