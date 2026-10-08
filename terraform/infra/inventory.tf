# Inventory as code. Ansible's cloud.terraform.terraform_provider inventory
# plugin reads these resources from this root's state; every Ansible phase
# after `infra` uses it. Only topology lives here — connection settings
# (user, key path, known_hosts, interpreter) are in ansible/group_vars/gt.yml.

resource "ansible_group" "gt" {
  name     = "gt"
  children = sort(distinct([for n in values(var.nodes) : n.group]))
}

resource "ansible_host" "node" {
  for_each = var.nodes

  name   = each.key
  groups = [each.value.group]

  variables = {
    ansible_host = multipass_instance.node[each.key].ipv4[0]
    gt_role      = each.value.role
    vault_role   = local.vault_role[each.key]
    cpus         = tostring(each.value.cpus)
    memory       = each.value.memory
    disk         = each.value.disk
  }
}
