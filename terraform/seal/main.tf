# Terraform builds the seal Vault's structure: the Transit mount and its one
# key, the two policies, the AppRole mount and its two roles. Secret-ids are
# credentials and never Terraform resources (Ansible mints them; the rotator
# replaces them).

data "terraform_remote_state" "infra" {
  backend = "local"

  config = {
    path = "${path.module}/../infra/terraform.tfstate"
  }
}

locals {
  repo_root = abspath("${path.module}/../..")
  agent_ip  = data.terraform_remote_state.infra.outputs.agent_address
}

resource "vault_mount" "transit" {
  path        = "transit"
  type        = "transit"
  description = "golden_ticket cluster auto-unseal"

  lifecycle {
    prevent_destroy = true
  }
}

# Destroying this key bricks the cluster: every node's barrier key is wrapped
# with it. Non-exportable, no plaintext backup, deletion refused by Vault and
# by Terraform.
resource "vault_transit_secret_backend_key" "autounseal" {
  backend                = vault_mount.transit.path
  name                   = "autounseal"
  type                   = "aes256-gcm96"
  exportable             = false
  allow_plaintext_backup = false
  deletion_allowed       = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "vault_policy" "autounseal" {
  name   = "autounseal"
  policy = file("${local.repo_root}/policies/autounseal.hcl")
}

resource "vault_policy" "seal_rotator" {
  name   = "gt-seal-rotator"
  policy = file("${local.repo_root}/policies/seal-rotator.hcl")
}

resource "vault_auth_backend" "approle" {
  type        = "approle"
  path        = "approle"
  description = "golden_ticket seal agent"
}

# The seal agent's identity: a short token, a secret-id that dies in a day,
# both usable only from the agent's address. Vault stores token_bound_cidrs
# x/32 as bare x; provider 5.11.0 normalises that, so /32 gives an empty plan
# (and no "invalid CIDR" warning) — docs/decisions.md D8.
resource "vault_approle_auth_backend_role" "autounseal" {
  backend               = vault_auth_backend.approle.path
  role_name             = "gt-seal-autounseal"
  token_policies        = [vault_policy.autounseal.name]
  token_ttl             = 3600
  token_max_ttl         = 86400
  token_type            = "service"
  secret_id_ttl         = 86400
  secret_id_num_uses    = 0
  secret_id_bound_cidrs = ["${local.agent_ip}/32"]
  token_bound_cidrs     = ["${local.agent_ip}/32"]
}

# The rotator: may only mint/destroy secret-ids of the role above.
resource "vault_approle_auth_backend_role" "rotator" {
  backend               = vault_auth_backend.approle.path
  role_name             = "gt-seal-rotator"
  token_policies        = [vault_policy.seal_rotator.name]
  token_ttl             = 600
  token_max_ttl         = 600
  token_type            = "service"
  secret_id_ttl         = 0
  secret_id_num_uses    = 0
  secret_id_bound_cidrs = ["${local.agent_ip}/32"]
  token_bound_cidrs     = ["${local.agent_ip}/32"]
}
