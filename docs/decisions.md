# Decisions

Evidence-backed decisions. Each section: what was asked, what was run, what
happened, and what golden_ticket does because of it.

## D1 — Multipass image identity with the Terraform provider (2026-10-08)

**Question.** Can `todoroff/multipass` 1.7.1 launch several VMs from the
same `file://` RHEL image, and do per-node clones avoid Multipass's
content-cache problems?

**Run.** Throwaway root, two `gt-poc-*` instances, `cpus = 1`,
`memory = "2G"`, `disk = "10G"`.

1. Both instances from `/Users/Shared/rhel-9.8-aarch64-kvm.qcow2` (virtual
   size 10 GiB): **both launches failed** with
   `Requested disk (10737418240 bytes) below minimum for this image (21474836480 bytes)`.
   Multipass resolves a `file://` image by content through the disk of the
   last instance created from it — here a 20 GiB red_pass node — so the image
   inherits that disk's size as a minimum. (The same mechanism gives the
   known "Failed to get shared write lock" when that instance is running.)
2. Per-node APFS clones (`cp -c`, plus a `golden-ticket-image-identity:<name>`
   trailer after the last qcow2 cluster): **both launched in parallel in 30 s**.
3. After deleting the clones, `terraform plan -detailed-exitcode` → `0`
   (the provider never reads the image again).

**Decision.** `ansible/images.yml` clones the image for every node that
does not exist yet; Terraform launches from
`file:///Users/Shared/gt-images/<name>.qcow2`; `make infra` removes the
clones of existing nodes after the apply (`CLEANUP=1`). The directory is
outside `~/Documents` (multipassd runs as root without TCC access).

## D2 — `ansible_playbook` inside the infra root (2026-10-08)

**Question.** In one root, does an `ansible_playbook` depending on
`multipass_instance` attributes run with real IPs on the first apply? Does
it inherit the environment? What lands in state? What happens on failure
and when the inputs change?

**Run.** Same throwaway root, `ansible/ansible` 1.5.0, a playbook that
prints the node map, reads an environment variable into a `no_log` fact,
waits for SSH, and can fail on demand.

- First apply: instances created, then the playbook ran **in the same
  apply** with the real IPs (in-graph `extra_vars`). ✅
- The process environment reaches the playbook (`lookup('env')` worked); the
  value appeared **nowhere** in state. ✅
- State keeps `ansible_playbook_stdout` (full Ansible output),
  `ansible_playbook_stderr`, `extra_vars`; `temp_inventory_file` is empty.
  State files are created `0644`. → every baseline task that could print a
  credential is `no_log`; `scripts/tf-run.sh` forces `0600`; the secret scan
  covers state.
- **With `replayable = false`, changing `extra_vars` does not re-run the
  playbook**: the resource is updated in place in about 1 s and only the stored
  attributes change. (So multi_pass's `automation_digest` in `extra_vars`
  never actually re-ran anything; that is why its `make lab` had to force
  `-replace` every time.)
- `lifecycle { replace_triggered_by = [terraform_data.trigger] }`, with
  the digest in the trigger's `input`: a changed digest → **replace** →
  the playbook runs. ✅
- A failing playbook fails the apply and taints only the playbook resource;
  the next apply re-runs it; the VMs are untouched. ✅

**Decision.** `ansible_playbook.baseline` uses `replayable = false` and
`replace_triggered_by` a `terraform_data` holding the baseline digest and the
node map. No `-replace` in the normal flow; `make baseline-rerun` is the
single documented forced run.

## D3 — Inventory plugin with ansible-core 2.21 (2026-10-08)

**Question.** Can Ansible read `ansible_host`/`ansible_group` resources
from the infra state with `cloud.terraform.terraform_provider`?

**Run.** `cloud.terraform` 4.0.0, ansible-core 2.21.

- Without options it fails:
  `get_bin_path() got an unexpected keyword argument 'required'` (the
  collection calls an API that ansible-core 2.21 changed).
- With `binary_path: <absolute terraform>` the plugin skips that call and
  shows group `gt`, its children, every host and its variables. ✅

**Decision.** `scripts/ansible-env.sh` generates
`.cache/ansible/inventory/terraform.yml` per machine (absolute
`project_path` and `binary_path`) and exports `ANSIBLE_INVENTORY` with
localhost plus that file once infra state exists.

## D4 — Connection settings live in Ansible, topology in Terraform

`ansible_host` resources carry only topology: `ansible_host`, `gt_role`,
`vault_role` and sizing. User, key path, known_hosts and interpreter are in
`ansible/group_vars/gt.yml`, so the baseline handoff and the inventory plugin
share one definition. One fact, one owner.

## D5 — Pinned collections installed into the project cache

`ansible-galaxy` skipped requirements that the Homebrew `ansible` bundle
already satisfied, so pinned versions could silently come from elsewhere,
and `ansible-lint` (own venv) could not resolve them.
`scripts/ansible-deps.sh` now forces the install whenever a pinned
collection is missing from `.cache/ansible/collections` at its pinned version.

## D6 — Two launches at a time (2026-10-08)

**Observed.** The first real `make infra` (eight nodes, Terraform's default
parallelism of 10) launched two VMs; the other six failed with
`launch failed: Failed to copy /Users/Shared/gt-images/<n>.qcow2 to …/multipassd/qemu/vault/instances/<n>/…`.
The two-VM POC (D1) had worked.

**Decision.** `make infra` applies with `-parallelism=2`
(`INFRA_PARALLELISM`, Makefile). Eight nodes plus the baseline take about
5.5 minutes. The postcondition uses `try(self.ipv4, [])`, so a failed launch
reports the launch error instead of an index error.

## D7 — The node map is a JSON tfvars file (2026-10-08)

**Observed.** preflight/images first read the node map with
`terraform console`, which evaluates locals against state. After a partly
failed apply that broke ("Invalid index") exactly when preflight mattered most.

**Decision.** `terraform/infra/nodes.auto.tfvars.json` is the single
definition of the topology. Terraform loads it automatically (the variable
keeps its validations; `terraform test` uses it too). Ansible reads the same
file as plain JSON, without evaluating any state.

## D8 — AppRole CIDRs round-trip (2026-10-08)

**Observed.** Vault stores `token_bound_cidrs = ["x/32"]` as bare `x`
(`secret_id_bound_cidrs` keeps `/32`). With bare `x` in configuration the plan
was empty, but `hashicorp/vault` 5.11.0 warned "invalid CIDR … will be
enforced in future releases". With `x/32` the plan is also empty (the
provider normalises the stored value) and the warning is gone.

**Decision.** `terraform/seal` writes `/32` for both lists. Ansible validation
normalises before comparing (as red_pass does).
