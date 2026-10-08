# Lab administrators (LDAP/Keycloak group gt-admins). Full control of the
# lab's Vault — this is a demo estate, not a production admin model.
path "*" {
  capabilities = ["create", "read", "update", "patch", "delete", "list", "sudo"]
}
