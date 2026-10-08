# Terraform builds the house: a VM is not finished until its RHEL baseline
# (RHSM, DNS, firewalld, chrony, SELinux, swap, /etc/hosts, SSH trust) has
# passed. The playbook runs here, inside the same apply, with the node map
# handed over in-graph (the inventory plugin cannot see hosts that are not
# yet in state).
#
# Re-run semantics (proven in docs/decisions.md): with replayable = false a
# changed extra_vars value does NOT re-run the playbook; only a replacement
# does. replace_triggered_by on the content digest + node map gives a
# content-driven re-run without ever forcing -replace in the normal flow.

locals {
  baseline_files = sort(concat(
    ["ansible/baseline.yml", "ansible/group_vars/all.yml", "ansible/group_vars/gt.yml",
    "terraform/infra/cloud-init/rhel.yaml.tftpl"],
    [for f in fileset("${local.repo_root}/ansible/roles/rhel_baseline", "**") : "ansible/roles/rhel_baseline/${f}"],
  ))
  baseline_digest = sha256(join("", [
    for f in local.baseline_files : "${f}:${filesha256("${local.repo_root}/${f}")}\n"
  ]))

  baseline_nodes = {
    for name, n in var.nodes : name => {
      ipv4       = multipass_instance.node[name].ipv4[0]
      group      = n.group
      gt_role    = n.role
      vault_role = local.vault_role[name]
    }
  }
}

resource "terraform_data" "baseline_trigger" {
  input = {
    digest = local.baseline_digest
    nodes  = local.baseline_nodes
  }
}

resource "ansible_playbook" "baseline" {
  name       = "localhost"
  playbook   = "${local.repo_root}/ansible/baseline.yml"
  replayable = false
  verbosity  = 0

  # Non-secret only: node map and the digest. RHSM values reach the playbook
  # through the process environment (scripts/tf-run.sh), never extra_vars.
  extra_vars = {
    gt_nodes_json   = jsonencode(local.baseline_nodes)
    baseline_digest = local.baseline_digest
  }

  timeouts {
    create = "45m"
  }

  lifecycle {
    replace_triggered_by = [terraform_data.baseline_trigger]
  }

  depends_on = [multipass_instance.node]
}
