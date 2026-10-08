# terraform test with mock providers: no Multipass, no Ansible run.

mock_provider "multipass" {
  mock_resource "multipass_instance" {
    defaults = {
      ipv4 = ["192.0.2.10"]
    }
  }
}

mock_provider "ansible" {}
mock_provider "local" {}

variables {
  ssh_public_key_path = "/dev/null"
}

run "default_topology" {
  command = apply

  variables {
    ssh_public_key_path = abspath("tests/fixtures/id_ed25519.pub")
  }

  assert {
    condition     = length(output.lab_nodes) == 8
    error_message = "Expected eight nodes."
  }

  assert {
    condition = (
      output.lab_nodes["gt-vault-1"].vault_role == "leader" &&
      output.lab_nodes["gt-vault-2"].vault_role == "follower" &&
      output.lab_nodes["gt-vault-3"].vault_role == "follower" &&
      output.lab_nodes["gt-vault-s"].vault_role == "seal" &&
      output.lab_nodes["gt-ux-1"].vault_role == "none"
    )
    error_message = "vault_role mapping is wrong."
  }

  assert {
    condition     = output.cluster_nodes[0] == "gt-vault-1" && length(output.cluster_nodes) == 3
    error_message = "cluster_nodes must list the leader first."
  }

  assert {
    condition     = toset(ansible_group.gt.children) == toset(["agent", "identity", "proxy", "ux", "vault", "vault_seal"])
    error_message = "Group gt must have the six role groups as children."
  }

  assert {
    condition     = ansible_host.node["gt-agent-1"].variables.gt_role == "agent" && ansible_host.node["gt-agent-1"].groups[0] == "agent"
    error_message = "Inventory host vars/groups wrong."
  }

  assert {
    condition     = alltrue([for k, v in output.lab_nodes : toset(keys(v)) == toset(["cpus", "disk", "group", "ipv4", "memory", "role", "vault_role"])])
    error_message = "lab_nodes contract shape changed."
  }
}

run "rejects_two_cluster_nodes" {
  command = plan

  variables {
    nodes = {
      "gt-vault-1" = { role = "cluster", group = "vault", cpus = 2, memory = "4G", disk = "20G" }
      "gt-vault-2" = { role = "cluster", group = "vault", cpus = 2, memory = "4G", disk = "20G" }
    }
  }

  expect_failures = [var.nodes]
}

run "rejects_foreign_name" {
  command = plan

  variables {
    nodes = {
      "red-vault-1"   = { role = "cluster", group = "vault", cpus = 2, memory = "4G", disk = "20G" }
      "gt-vault-2"    = { role = "cluster", group = "vault", cpus = 2, memory = "4G", disk = "20G" }
      "gt-vault-3"    = { role = "cluster", group = "vault", cpus = 2, memory = "4G", disk = "20G" }
      "gt-vault-s"    = { role = "seal", group = "vault_seal", cpus = 1, memory = "2G", disk = "10G" }
      "gt-agent-1"    = { role = "agent", group = "agent", cpus = 1, memory = "2G", disk = "10G" }
      "gt-proxy-1"    = { role = "proxy", group = "proxy", cpus = 1, memory = "2G", disk = "10G" }
      "gt-identity-1" = { role = "identity", group = "identity", cpus = 2, memory = "4G", disk = "15G" }
      "gt-ux-1"       = { role = "ux", group = "ux", cpus = 1, memory = "2G", disk = "10G" }
    }
  }

  expect_failures = [var.nodes]
}

run "rejects_two_seals_and_small_memory" {
  command = plan

  variables {
    nodes = {
      "gt-vault-1"    = { role = "cluster", group = "vault", cpus = 2, memory = "4G", disk = "20G" }
      "gt-vault-2"    = { role = "cluster", group = "vault", cpus = 2, memory = "4G", disk = "20G" }
      "gt-vault-3"    = { role = "cluster", group = "vault", cpus = 2, memory = "4G", disk = "20G" }
      "gt-vault-s"    = { role = "seal", group = "vault_seal", cpus = 1, memory = "2G", disk = "10G" }
      "gt-vault-t"    = { role = "seal", group = "vault_seal", cpus = 1, memory = "1G", disk = "10G" }
      "gt-agent-1"    = { role = "agent", group = "agent", cpus = 1, memory = "2G", disk = "10G" }
      "gt-proxy-1"    = { role = "proxy", group = "proxy", cpus = 1, memory = "2G", disk = "10G" }
      "gt-identity-1" = { role = "identity", group = "identity", cpus = 2, memory = "4G", disk = "15G" }
      "gt-ux-1"       = { role = "ux", group = "ux", cpus = 1, memory = "2G", disk = "10G" }
    }
  }

  expect_failures = [var.nodes]
}
