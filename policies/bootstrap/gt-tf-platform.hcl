# gt-tf-platform — Terraform's token on the cluster (terraform/platform).
# Structure only: namespaces, mounts (root + one namespace level), ACL
# policies, token roles, licence status. No auth methods, no identity, no
# secret data.

path "sys/namespaces" {
  capabilities = ["list"]
}

path "sys/namespaces/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "sys/mounts" {
  capabilities = ["read"]
}

path "sys/mounts/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "+/sys/mounts" {
  capabilities = ["read"]
}

path "+/sys/mounts/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "sys/policies/acl" {
  capabilities = ["list"]
}

path "sys/policies/acl/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "sys/policy/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "auth/token/roles" {
  capabilities = ["list"]
}

path "auth/token/roles/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "sys/license/status" {
  capabilities = ["read"]
}

path "sys/health" {
  capabilities = ["read"]
}

# The Vault provider issues itself a short child token (kept for audit).
path "auth/token/create" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

# ── Never ────────────────────────────────────────────────────────────────────
path "sys/policies/acl/gt-tf-*" {
  capabilities = ["deny"]
}

path "sys/policies/acl/gt-ansible-*" {
  capabilities = ["deny"]
}

path "sys/policy/gt-tf-*" {
  capabilities = ["deny"]
}

path "sys/policy/gt-ansible-*" {
  capabilities = ["deny"]
}

path "auth/token/roles/gt-tf-*" {
  capabilities = ["deny"]
}

path "auth/token/roles/gt-ansible-*" {
  capabilities = ["deny"]
}

path "sys/auth/*" {
  capabilities = ["deny"]
}

path "identity/*" {
  capabilities = ["deny"]
}

path "secret/*" {
  capabilities = ["deny"]
}
