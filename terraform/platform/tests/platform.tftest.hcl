# terraform test with mocked Vault/HTTP providers, licence and infra contract.

mock_provider "vault" {}
mock_provider "http" {
  mock_data "http" {
    defaults = {
      status_code = 200
    }
  }
}

override_data {
  target = data.terraform_remote_state.infra
  values = {
    outputs = {
      ux_address          = "192.0.2.20"
      proxy_address       = "192.0.2.30"
      vault_api_addresses = { "gt-vault-1" = "https://192.0.2.11:8200" }
    }
  }
}

override_data {
  target = data.vault_generic_secret.license
  values = {
    data_json = "{\"autoloaded\":{\"features\":[\"KMIP\",\"Transform Secrets Engine\"]}}"
  }
}

run "engines_follow_the_licence" {
  command = apply

  assert {
    condition     = contains(output.engines.mounted, "kmip") && contains(output.engines.mounted, "transform")
    error_message = "Licensed Enterprise engines must be mounted."
  }

  assert {
    condition     = output.engines.skipped["keymgmt"] == "licence lacks Key Management Secrets Engine"
    error_message = "An unlicensed engine must be skipped with the missing feature as reason."
  }

  assert {
    condition     = output.engines.skipped["database"] == "needs a database to connect to"
    error_message = "A disabled engine must be skipped with its own reason."
  }

  assert {
    condition     = contains(output.engines.mounted, "kv") && contains(output.engines.mounted, "totp")
    error_message = "Open-source self-contained engines must be mounted."
  }

  assert {
    condition     = vault_token_auth_backend_role.ui_engines.token_bound_cidrs == toset(["192.0.2.20/32", "192.0.2.30/32"]) && vault_token_auth_backend_role.ui_engines.token_no_default_policy
    error_message = "The console token role must be bound to the console VM and the front door, and carry no default policy."
  }

  assert {
    condition     = output.mounts["root/secret"] == "kv"
    error_message = "The root secret/ mount must exist."
  }
}

run "never_builtin" {
  command = plan

  variables {
    engines = [
      { type = "cubbyhole", path = "cubbyhole" },
      { type = "kv", path = "kv2", options = { version = "2" } },
    ]
  }

  assert {
    condition     = local.engine_state["cubbyhole"] == "built-in mount, managed by Vault"
    error_message = "Built-in mounts are never managed."
  }
}

run "rejects_undeclared_namespace" {
  command = plan

  variables {
    mounts = {
      stray = { namespace = "finance", path = "kv", type = "kv" }
    }
  }

  expect_failures = [var.mounts]
}

run "rejects_bootstrap_policy" {
  command = plan

  variables {
    person_policies = ["gt-admin", "gt-tf-platform"]
  }

  expect_failures = [var.person_policies]
}
