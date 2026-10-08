terraform {
  required_version = ">= 1.11.0, < 2.0.0"

  required_providers {
    http = {
      source  = "hashicorp/http"
      version = "3.6.2"
    }
    vault = {
      source  = "hashicorp/vault"
      version = "5.11.0"
    }
  }
}

# VAULT_ADDR (the ACTIVE node, resolved by scripts/vault-addr.sh), VAULT_TOKEN
# (the gt-tf-platform bootstrap token) and VAULT_CACERT come only from the
# environment scripts/tf-run.sh exports — never a Terraform variable.
provider "vault" {}
