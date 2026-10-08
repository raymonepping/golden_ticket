variable "namespaces" {
  description = "Enterprise namespaces directly below root."
  type        = set(string)
  default     = ["engineering", "operations", "engines"]

  validation {
    condition     = alltrue([for n in var.namespaces : can(regex("^[a-z][a-z0-9-]*$", n))])
    error_message = "Namespace names must be lowercase path segments without slashes."
  }
}

variable "mounts" {
  description = "Secret-engine mounts keyed by a stable logical name. namespace = null means root."
  type = map(object({
    namespace   = optional(string)
    path        = string
    type        = string
    description = optional(string, "Managed by Terraform")
    options     = optional(map(string), {})
  }))

  default = {
    engineering_kv = {
      namespace   = "engineering"
      path        = "kv"
      type        = "kv"
      description = "KV v2 for the engineering team"
      options     = { version = "2" }
    }
    engineering_transit = {
      namespace   = "engineering"
      path        = "transit"
      type        = "transit"
      description = "Encryption as a service for the engineering team"
    }
    operations_pki = {
      namespace   = "operations"
      path        = "pki"
      type        = "pki"
      description = "PKI mount (no CA generated: no key material in state)"
    }
  }

  validation {
    condition     = alltrue([for m in values(var.mounts) : m.namespace == null || contains(var.namespaces, coalesce(m.namespace, "-"))])
    error_message = "Every mount must target root (null) or a declared namespace."
  }
}

variable "transit_keys" {
  description = "Named Transit keys (structure, never material): namespace/mount/name."
  type = map(object({
    namespace = string
    mount     = string
    name      = string
  }))
  default = {
    engineering_demo = { namespace = "engineering", mount = "transit", name = "gt-demo" }
  }
}

variable "engines_namespace" {
  description = "Namespace that holds the self-contained secrets engines shown on the console's Engines page."
  type        = string
  default     = "engines"
}

# Ported from red_pass roles/vault_engines/defaults/main.yml. Mounted only when
# enabled AND (no licence feature needed OR the licence has it).
variable "engines" {
  description = "Secrets engines for the engines namespace."
  type = list(object({
    type            = string
    path            = string
    description     = optional(string, "")
    options         = optional(map(string), {})
    license_feature = optional(string)
    enabled         = optional(bool, true)
    skip_reason     = optional(string, "")
  }))
  default = [
    # ── self-contained, open source ─────────────────────────────────────────
    { type = "kv", path = "kv", description = "Key/Value v2", options = { version = "2" } },
    { type = "transit", path = "transit", description = "Encryption as a service" },
    { type = "pki", path = "pki", description = "X.509 certificates" },
    { type = "ssh", path = "ssh", description = "Signed SSH certificates and OTPs" },
    { type = "totp", path = "totp", description = "Time-based one-time passwords" },
    # ── self-contained, Enterprise ──────────────────────────────────────────
    { type = "transform", path = "transform", description = "Tokenization and format-preserving encryption", license_feature = "Transform Secrets Engine" },
    { type = "kmip", path = "kmip", description = "KMIP server (no listener until kmip/config is written)", license_feature = "KMIP" },
    { type = "keymgmt", path = "keymgmt", description = "Key lifecycle for cloud KMS", license_feature = "Key Management Secrets Engine" },
    { type = "spiffe", path = "spiffe", description = "SPIFFE SVIDs issued by Vault", license_feature = "SPIFFE Secrets Engine" },
    # ── need an external system to be meaningful: listed, not mounted ──────
    { type = "pki-external-ca", path = "pki-external-ca", enabled = false, license_feature = "PKI External CA Secrets Engine", skip_reason = "needs an ACME certificate authority" },
    { type = "database", path = "database", enabled = false, skip_reason = "needs a database to connect to" },
    { type = "ldap", path = "ldap", enabled = false, skip_reason = "needs a directory with a privileged bind account" },
    { type = "kubernetes", path = "kubernetes", enabled = false, skip_reason = "needs a Kubernetes cluster" },
    { type = "aws", path = "aws", enabled = false, skip_reason = "needs AWS credentials" },
    { type = "azure", path = "azure", enabled = false, skip_reason = "needs an Azure service principal" },
    { type = "gcp", path = "gcp", enabled = false, skip_reason = "needs a GCP service account" },
    { type = "gcpkms", path = "gcpkms", enabled = false, skip_reason = "needs GCP Cloud KMS" },
    { type = "alicloud", path = "alicloud", enabled = false, skip_reason = "needs AliCloud credentials" },
    { type = "consul", path = "consul", enabled = false, skip_reason = "needs a Consul cluster" },
    { type = "nomad", path = "nomad", enabled = false, skip_reason = "needs a Nomad cluster" },
    { type = "rabbitmq", path = "rabbitmq", enabled = false, skip_reason = "needs a RabbitMQ server" },
    { type = "mongodbatlas", path = "mongodbatlas", enabled = false, skip_reason = "needs MongoDB Atlas API keys" },
    { type = "terraform", path = "terraform", enabled = false, skip_reason = "needs an HCP Terraform API token" },
    { type = "vault-plugin-secrets-os", path = "os", enabled = false, skip_reason = "plugin must be downloaded and registered first, and needs SSH to target hosts" },
  ]

  validation {
    condition     = length(distinct([for e in var.engines : e.path])) == length(var.engines)
    error_message = "Engine paths must be unique."
  }
}

variable "person_policies" {
  description = "ACL policies Terraform owns (file under policies/). Never the gt-tf-*/gt-ansible-* bootstrap policies."
  type        = set(string)
  default     = ["gt-admin", "gt-operator", "gt-viewer", "gt-ui-engines"]

  validation {
    condition     = alltrue([for p in var.person_policies : !startswith(p, "gt-tf-") && !startswith(p, "gt-ansible-")])
    error_message = "The bootstrap policies belong to Ansible (they let each tool in); Terraform must never manage them."
  }
}
