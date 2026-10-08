# The contract for everything above this layer. A future substrate
# (vSphere, Proxmox, a cloud) must produce lab_nodes in exactly this shape.
output "lab_nodes" {
  description = "Every VM: role, Ansible group, vault_role, IPv4 and sizing (non-secret)."
  value = {
    for name, n in var.nodes : name => {
      role       = n.role
      group      = n.group
      vault_role = local.vault_role[name]
      ipv4       = multipass_instance.node[name].ipv4[0]
      cpus       = n.cpus
      memory     = n.memory
      disk       = n.disk
    }
  }
}

output "cluster_nodes" {
  description = "Raft cluster node names, leader first."
  value       = concat([local.leader], [for n in local.cluster_nodes : n if n != local.leader])
}

output "vault_api_addresses" {
  description = "Vault API address of every cluster node."
  value       = { for n in local.cluster_nodes : n => "https://${multipass_instance.node[n].ipv4[0]}:8200" }
}

output "seal_vault_address" {
  value = one([for name, n in var.nodes : "https://${multipass_instance.node[name].ipv4[0]}:8200" if n.role == "seal"])
}

output "agent_address" {
  value = one([for name, n in var.nodes : multipass_instance.node[name].ipv4[0] if n.role == "agent"])
}

output "ux_address" {
  value = one([for name, n in var.nodes : multipass_instance.node[name].ipv4[0] if n.role == "ux"])
}

output "baseline_digest" {
  description = "Digest of the RHEL baseline that the last apply ran."
  value       = local.baseline_digest
}
