# gt-ansible-platform — Ansible's token on the cluster (identity, proxy,
# console, validation). Configuration only: the auth methods and identity
# groups that connect people to the policies Terraform created, the identity
# and proxy secrets, and tokens issued through Terraform-made token roles.
# It never creates a mount or writes a policy.

# ── Auth methods (people) ────────────────────────────────────────────────────
path "sys/auth" {
  capabilities = ["read"]
}

path "sys/auth/oidc" {
  capabilities = ["create", "read", "update", "sudo"]
}

path "sys/auth/jwt" {
  capabilities = ["create", "read", "update", "sudo"]
}

path "sys/auth/ldap" {
  capabilities = ["create", "read", "update", "sudo"]
}

path "auth/oidc/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "auth/jwt/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "auth/ldap/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# ── Identity groups and aliases ──────────────────────────────────────────────
path "identity/group" {
  capabilities = ["create", "update"]
}

path "identity/group/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "identity/group-alias" {
  capabilities = ["create", "update"]
}

path "identity/group-alias/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "identity/lookup/group" {
  capabilities = ["update"]
}

# ── Secrets this lab generates (identity, proxy) ─────────────────────────────
path "secret/data/golden-ticket/*" {
  capabilities = ["create", "read", "update"]
}

path "secret/metadata/golden-ticket/*" {
  capabilities = ["read", "list"]
}

# ── Tokens only through Terraform-made roles ─────────────────────────────────
path "auth/token/create/gt-ui-engines" {
  capabilities = ["update"]
}

path "auth/token/lookup" {
  capabilities = ["update"]
}

path "auth/token/lookup-accessor" {
  capabilities = ["update"]
}

# ── Read-only evidence for validation ────────────────────────────────────────
path "sys/policies/acl/*" {
  capabilities = ["read", "list"]
}

path "sys/mounts" {
  capabilities = ["read"]
}

path "+/sys/mounts" {
  capabilities = ["read"]
}

path "sys/namespaces" {
  capabilities = ["list"]
}

path "auth/token/roles/*" {
  capabilities = ["read"]
}

path "sys/storage/raft/configuration" {
  capabilities = ["read"]
}

path "sys/license/status" {
  capabilities = ["read"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

# ── Never ────────────────────────────────────────────────────────────────────
path "sys/mounts/*" {
  capabilities = ["deny"]
}

path "+/sys/mounts/*" {
  capabilities = ["deny"]
}

path "sys/namespaces/*" {
  capabilities = ["deny"]
}

path "sys/policy/*" {
  capabilities = ["deny"]
}
