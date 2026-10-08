# terraform test with a mock Vault provider and an overridden infra contract.

mock_provider "vault" {}

override_data {
  target = data.terraform_remote_state.infra
  values = {
    outputs = {
      seal_vault_address = "https://192.0.2.5:8200"
      agent_address      = "192.0.2.7"
    }
  }
}

run "seal_structure" {
  command = apply

  assert {
    condition     = vault_approle_auth_backend_role.autounseal.secret_id_bound_cidrs == toset(["192.0.2.7/32"])
    error_message = "The agent role's secret-id must be bound to the agent's address."
  }

  assert {
    condition     = vault_approle_auth_backend_role.autounseal.token_bound_cidrs == toset(["192.0.2.7/32"])
    error_message = "The agent role's token must be bound to the agent's address."
  }

  assert {
    condition     = vault_approle_auth_backend_role.rotator.token_bound_cidrs == toset(["192.0.2.7/32"])
    error_message = "The rotator role must be bound to the agent's address."
  }

  assert {
    condition = (
      !vault_transit_secret_backend_key.autounseal.exportable &&
      !vault_transit_secret_backend_key.autounseal.allow_plaintext_backup &&
      !vault_transit_secret_backend_key.autounseal.deletion_allowed
    )
    error_message = "The auto-unseal key must be non-exportable, without plaintext backup, undeletable."
  }

  assert {
    condition     = vault_approle_auth_backend_role.autounseal.token_policies == toset(["autounseal"])
    error_message = "The agent role must carry exactly the autounseal policy."
  }
}
