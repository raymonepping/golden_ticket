# Console Engines page: list what is mounted in the engines namespace. Policy
# and token role: terraform/platform; the token itself: ansible/ux.yml. Nothing else — not even the default policy.
path "engines/sys/mounts" {
  capabilities = ["read"]
}

# Its own token only.
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}
