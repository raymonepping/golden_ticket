# What Terraform declared; Ansible validation proves each of these exists
# (the second Terraform → Ansible contract, after the inventory).
output "namespaces" {
  value = sort(tolist(var.namespaces))
}

output "mounts" {
  description = "<namespace or root>/<path> → type, for every mount Terraform owns."
  value = merge(
    { for k, m in vault_mount.this : "${coalesce(var.mounts[k].namespace, "root")}/${m.path}" => m.type },
    { "root/${vault_mount.secret.path}" = vault_mount.secret.type },
    { for k, m in vault_mount.engine : "${var.engines_namespace}/${m.path}" => m.type },
  )
}

output "engines" {
  description = "Engines namespace: what is mounted, and why the rest is not."
  value = {
    namespace = var.engines_namespace
    mounted   = sort(keys(local.engines_mounted))
    skipped   = local.engines_skipped
  }
}

output "policies" {
  value = sort([for p in vault_policy.person : p.name])
}

output "token_roles" {
  value = [vault_token_auth_backend_role.ui_engines.role_name]
}

output "transit_keys" {
  value = { for k, t in vault_transit_secret_backend_key.this : k => "${var.transit_keys[k].namespace}/${t.backend}/${t.name}" }
}
