# Terraform builds the structure inside the cluster: namespaces, mounts
# (including secret/ and the engines namespace), Transit keys, ACL policies
# and token roles. The people who use them (auth methods, groups, aliases)
# and every secret value are Ansible's.

data "terraform_remote_state" "infra" {
  backend = "local"

  config = {
    path = "${path.module}/../infra/terraform.tfstate"
  }
}

locals {
  repo_root = abspath("${path.module}/../..")
  ux_ip     = data.terraform_remote_state.infra.outputs.ux_address
  proxy_ip  = data.terraform_remote_state.infra.outputs.proxy_address

  # Licence metadata only (features, expiry, licence id) — never the licence
  # itself (docs/decisions.md D9). The provider marks data_json sensitive; the
  # feature NAMES are not secret and drive for_each, so only they are
  # unmarked. ("Sensitive" never kept anything out of state anyway.)
  license_features = toset(nonsensitive(try(jsondecode(data.vault_generic_secret.license.data_json).autoloaded.features, [])))

  builtin_types  = ["system", "identity", "cubbyhole", "agent_registry", "ns_system", "ns_identity", "ns_cubbyhole", "ns_agent_registry"]
  reserved_paths = ["sys", "identity", "cubbyhole", "agent-registry"]

  engine_state = {
    for e in var.engines : e.path => (
      contains(local.builtin_types, e.type) || contains(local.reserved_paths, e.path) ? "built-in mount, managed by Vault" :
      !e.enabled ? e.skip_reason :
      e.license_feature != null && !contains(local.license_features, coalesce(e.license_feature, "-")) ? "licence lacks ${coalesce(e.license_feature, "-")}" :
      "mount"
    )
  }
  engines_mounted = { for e in var.engines : e.path => e if local.engine_state[e.path] == "mount" }
  engines_skipped = { for path, why in local.engine_state : path => why if why != "mount" }
}

data "vault_generic_secret" "license" {
  path = "sys/license/status"
}

resource "vault_namespace" "this" {
  for_each = var.namespaces
  path     = each.value
}

resource "vault_mount" "this" {
  for_each = var.mounts

  namespace   = each.value.namespace == null ? null : vault_namespace.this[each.value.namespace].path_fq
  path        = each.value.path
  type        = each.value.type
  description = each.value.description
  options     = each.value.options
}

# Root KV v2 holding the identity and proxy secrets Ansible generates
# (prompt 07). Its data is not Terraform's; the mount must never be removed by
# a code change.
resource "vault_mount" "secret" {
  path        = "secret"
  type        = "kv"
  description = "golden_ticket generated secrets (identity, proxy) — values written by Ansible"
  options     = { version = "2" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "vault_transit_secret_backend_key" "this" {
  for_each = var.transit_keys

  namespace        = vault_namespace.this[each.value.namespace].path_fq
  backend          = vault_mount.this["${each.value.namespace}_${each.value.mount}"].path
  name             = each.value.name
  exportable       = false
  deletion_allowed = true
}

resource "vault_mount" "engine" {
  for_each = local.engines_mounted

  namespace   = vault_namespace.this[var.engines_namespace].path_fq
  path        = each.value.path
  type        = each.value.type
  description = each.value.description
  options     = each.value.options
}

resource "vault_policy" "person" {
  for_each = var.person_policies

  name   = each.value
  policy = file("${local.repo_root}/policies/${each.value}.hcl")
}

# The console's Engines token: Terraform builds the role (exactly one policy,
# orphan, periodic, no default policy); Ansible issues the token and renews it
# below 72 h. Bound to the console VM and the front door: the console reads
# Vault through the proxy, so Vault sees the proxy's address.
resource "vault_token_auth_backend_role" "ui_engines" {
  role_name               = "gt-ui-engines"
  allowed_policies        = [vault_policy.person["gt-ui-engines"].name]
  orphan                  = true
  renewable               = true
  token_period            = 2592000
  token_no_default_policy = true
  token_bound_cidrs       = ["${local.ux_ip}/32", "${local.proxy_ip}/32"]
}

# A Terraform-native continuous assertion: warns (never blocks) when the
# cluster does not answer healthy. The read is a normal data source on purpose:
# a data source scoped inside a check block is always deferred to apply, which
# makes `plan -detailed-exitcode` report a change on every run
# (docs/decisions.md D10).
data "http" "cluster_health" {
  url         = "${values(data.terraform_remote_state.infra.outputs.vault_api_addresses)[0]}/v1/sys/health?standbyok=true&perfstandbyok=true"
  ca_cert_pem = try(file("${local.repo_root}/.secrets/tls/ca.crt"), null)
}

check "cluster_healthy" {
  assert {
    condition     = data.http.cluster_health.status_code == 200
    error_message = "The Vault cluster does not answer healthy (HTTP ${data.http.cluster_health.status_code})."
  }
}
