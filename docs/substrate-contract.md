# The substrate contract

Multipass is the first substrate, not the architecture. Everything above
`terraform/infra` — every Ansible phase and both Vault roots — depends on a
small, explicit contract. A new substrate (vSphere, Proxmox, OpenStack, AWS,
bare metal) needs a new `terraform/infra-<name>` root that produces exactly
this; nothing else has to change.

## 1. The `lab_nodes` output

```hcl
output "lab_nodes" {
  value = {
    "<name>" = {
      role       = "cluster" | "seal" | "agent" | "proxy" | "identity" | "ux"
      group      = "vault" | "vault_seal" | "agent" | "proxy" | "identity" | "ux"
      vault_role = "leader" | "follower" | "seal" | "none"
      ipv4       = "<address Ansible and the other nodes reach>"
      cpus       = <number>
      memory     = "<n>G"
      disk       = "<n>G"
    }
  }
}
```

Rules: names match `^gt-[a-z0-9-]+$`; exactly three `cluster` nodes (one
`leader`), exactly one of every other role. `terraform test` in
`terraform/infra/tests/` asserts this shape; a new root should carry the same
test.

Consumers: `scripts/status.sh`, `scripts/vault-addr.sh`, `validate.yml`,
the console (Provisioned indicator), `make destroy`.

## 2. The other outputs

`cluster_nodes` (leader first), `vault_api_addresses`, `seal_vault_address`,
`agent_address`, `proxy_address`, `ux_address`, `baseline_digest`.
`terraform/seal` and `terraform/platform` read them through
`terraform_remote_state`; with a remote backend that becomes a workspace
output reference.

## 3. The inventory resources

`ansible_group "gt"` with the six role groups as children, and one
`ansible_host` per node with variables `ansible_host`, `gt_role`,
`vault_role`, `cpus`, `memory`, `disk`. Connection settings (user, key path,
known_hosts, interpreter) are **not** part of the contract; they live in
`ansible/group_vars/gt.yml`.

## 4. The guest

RHEL 9 (aarch64 or x86_64 with the matching Vault archive), cloud-init that
installs the controller's public key for user `ubuntu` (rename in
`group_vars/gt.yml` for another image), SSH on 22, outbound access to Red Hat
CDN (or a Satellite) and to `releases.hashicorp.com` (or a mirror).

## 5. The baseline

The new root runs the same `ansible/baseline.yml` through an
`ansible_playbook` resource with `gt_nodes_json` and `baseline_digest` in
`extra_vars`, re-run via `replace_triggered_by` on a `terraform_data` that
holds the digest and the node map ([decisions D2](decisions.md)).

## What stays substrate-specific

Image handling (the Multipass content-cache clones of D1 have no meaning on
vSphere), parallelism limits (D6), sizing refresh (D13: another provider may
detect sizing drift that this one cannot — the Ansible `sizing` check stays
either way), and networking.

No second substrate is built in this repository; this page is the contract a
second one would have to meet.
