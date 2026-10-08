# The topology of the whole lab is defined once, in nodes.auto.tfvars.json
# (plain JSON, so preflight/images can read it without evaluating state).
# Ansible learns names, groups, roles and addresses from the inventory
# resources in inventory.tf.

variable "nodes" {
  description = "Every golden_ticket VM: role, Ansible group and sizing."
  type = map(object({
    role   = string
    group  = string
    cpus   = number
    memory = string
    disk   = string
  }))


  validation {
    condition     = alltrue([for name in keys(var.nodes) : can(regex("^gt-[a-z0-9-]+$", name))])
    error_message = "Every node name must match ^gt-[a-z0-9-]+$ (the golden_ticket allow-list prefix)."
  }

  validation {
    condition     = length([for n in values(var.nodes) : n if n.role == "cluster"]) == 3
    error_message = "The lab is designed for exactly three Raft cluster nodes."
  }

  validation {
    condition = alltrue([
      for role in ["seal", "agent", "proxy", "identity", "ux"] :
      length([for n in values(var.nodes) : n if n.role == role]) == 1
    ])
    error_message = "Exactly one node each for seal, agent, proxy, identity and ux."
  }

  validation {
    condition = alltrue([
      for n in values(var.nodes) :
      contains(["vault", "vault_seal", "agent", "proxy", "identity", "ux"], n.group) &&
      can(regex("^[0-9]+G$", n.memory)) && can(regex("^[0-9]+G$", n.disk)) &&
      tonumber(trimsuffix(n.memory, "G")) >= 2
    ])
    error_message = "Unknown group, or sizing not in <n>G form, or memory below 2G (dnf is OOM-killed at 1G)."
  }
}

variable "image_dir" {
  description = "Directory with the per-node image clones made by ansible/images.yml (outside ~/Documents: TCC)."
  type        = string
  default     = "/Users/Shared/gt-images"

  validation {
    condition     = startswith(var.image_dir, "/") && !strcontains(var.image_dir, "/Documents/")
    error_message = "image_dir must be absolute and outside ~/Documents (multipassd cannot read it)."
  }
}

variable "command_timeout_seconds" {
  description = "Timeout for each Multipass CLI call made by the provider."
  type        = number
  default     = 900
}

variable "ssh_public_key_path" {
  description = "Public half of the controller key (default: .secrets/ansible/id_ed25519.pub, made by ansible/preflight.yml)."
  type        = string
  default     = null

  validation {
    condition     = var.ssh_public_key_path == null || startswith(coalesce(var.ssh_public_key_path, "/"), "/")
    error_message = "ssh_public_key_path must be absolute."
  }
}
