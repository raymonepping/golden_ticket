# Viewers (group gt-viewers): see what exists, never read or write data.
path "sys/mounts" {
  capabilities = ["read"]
}

path "+/sys/mounts" {
  capabilities = ["read"]
}

path "engineering/kv/metadata/*" {
  capabilities = ["list"]
}

path "engineering/transit/keys" {
  capabilities = ["list"]
}
