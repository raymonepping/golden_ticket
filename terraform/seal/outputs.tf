# Names only. role_id sits in state as an identifier (not a secret), but it
# is not an output: Ansible reads role-ids from Vault with its own token.
output "transit_mount" {
  value = vault_mount.transit.path
}

output "transit_key" {
  value = vault_transit_secret_backend_key.autounseal.name
}

output "approle_roles" {
  value = {
    agent   = vault_approle_auth_backend_role.autounseal.role_name
    rotator = vault_approle_auth_backend_role.rotator.role_name
  }
}

output "policies" {
  value = [vault_policy.autounseal.name, vault_policy.seal_rotator.name]
}
