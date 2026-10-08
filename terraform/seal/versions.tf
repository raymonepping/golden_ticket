terraform {
  required_version = ">= 1.11.0, < 2.0.0"

  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "5.11.0"
    }
  }
}

# Address from the infra contract. VAULT_TOKEN (the gt-tf-seal bootstrap
# token) and VAULT_CACERT come only from the environment scripts/tf-run.sh
# exports — never a Terraform variable.
provider "vault" {
  address = data.terraform_remote_state.infra.outputs.seal_vault_address
}
