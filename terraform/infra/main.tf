locals {
  repo_root = abspath("${path.module}/../..")

  # Leader = the first cluster node by name (gt-vault-1).
  ssh_public_key_path = coalesce(var.ssh_public_key_path, "${local.repo_root}/.secrets/ansible/id_ed25519.pub")

  cluster_nodes = sort([for name, n in var.nodes : name if n.role == "cluster"])
  leader        = local.cluster_nodes[0]
  vault_role = {
    for name, n in var.nodes : name => (
      n.role == "seal" ? "seal" :
      n.role != "cluster" ? "none" :
      name == local.leader ? "leader" : "follower"
    )
  }
}

# The controller key pair is created by ansible/preflight.yml; only the
# public half is read here. The private key never enters configuration,
# plan or state.
resource "local_file" "cloud_init" {
  filename             = "${local.repo_root}/.build/cloud-init/rhel.yaml"
  directory_permission = "0700"
  file_permission      = "0600"
  content = templatefile("${path.module}/cloud-init/rhel.yaml.tftpl", {
    ssh_public_key = trimspace(file(local.ssh_public_key_path))
  })
}

resource "multipass_instance" "node" {
  for_each = var.nodes

  name = each.key
  # Per-node APFS clone with a unique identity (ansible/images.yml):
  # Multipass caches file:// images by content and resolves them through the
  # disk of the last instance made from that content — which fails with a
  # write lock (that VM is running) or inherits its larger disk as a minimum.
  image           = "file://${var.image_dir}/${each.key}.qcow2"
  cpus            = each.value.cpus
  memory          = each.value.memory
  disk            = each.value.disk
  cloud_init_file = local_file.cloud_init.filename

  lifecycle {
    # cloud-init only applies at creation: a changed template must never
    # replace a running VM.
    ignore_changes = [cloud_init_file]

    postcondition {
      condition     = length(try(self.ipv4, [])) > 0
      error_message = "${each.key} came up without an IPv4 address."
    }
  }
}
