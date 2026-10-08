# Operators (group gt-operators): use the engineering namespace's
# KV v2 and Transit; no configuration changes.
path "engineering/kv/data/*" {
  capabilities = ["create", "read", "update", "patch", "delete"]
}

path "engineering/kv/metadata/*" {
  capabilities = ["read", "list"]
}

path "engineering/transit/encrypt/*" {
  capabilities = ["update"]
}

path "engineering/transit/decrypt/*" {
  capabilities = ["update"]
}

path "engineering/transit/keys" {
  capabilities = ["list"]
}

path "engineering/transit/keys/*" {
  capabilities = ["read"]
}
