# From lab to estate

golden_ticket runs on a Mac, but every mechanism in it has a production
counterpart. This page maps them, so the lab can be read as a small model of
an enterprise pipeline rather than a demo trick.

| Lab | Enterprise |
| --- | --- |
| `make lab` + `scripts/phases.txt` | CI/CD pipeline stages, each with an approval or a policy check before the next |
| Local state per root (`terraform/{infra,seal,platform}`) | HCP Terraform / Terraform Enterprise workspaces with run triggers `infra → seal → platform`, state encrypted and access-controlled per workspace |
| `ansible_playbook.baseline` in `terraform/infra` | a Red Hat Ansible Automation Platform job template launched by Terraform after provisioning (`ansible/aap` provider, `aap_job`), with the run's result gating the apply |
| `cloud.terraform` inventory plugin over `ansible_host` / `ansible_group` | an AAP inventory source that reads Terraform state (the same `ansible/ansible` resources) |
| Four scoped bootstrap tokens (`gt-tf-*`, `gt-ansible-*`) | Vault-backed dynamic provider credentials per workspace and short-lived Vault credentials per AAP job; the boundary between the tools is still enforced by Vault policy |
| Root tokens in `.secrets/*-init.json` (break-glass) | recovery keys and root generation under split control (Shamir holders, `vault operator generate-root` only in an incident) |
| `make drift` | HCP Terraform health assessments (continuous drift detection) and scheduled AAP check-mode jobs |
| `make idempotency` | a second AAP job run in the pipeline that must report `changed=0` |
| `make secret-scan` | secret scanning on state, logs and artifacts in the pipeline (and on the repository: gitleaks is already wired in CI) |
| `.build/*.json` + the console | the evidence trail an auditor asks for: who built what, what changed, what was proven, when |
| Multipass via `todoroff/multipass` | vSphere, Proxmox, OpenStack or a cloud provider emitting the same `lab_nodes` contract — see [substrate-contract.md](substrate-contract.md) |
| Seal Vault + seal agent on a VM | a cloud KMS or HSM seal, or a dedicated transit Vault cluster in another failure domain, with the agent pattern unchanged |

## What carries over unchanged

- **The ownership rule.** Terraform builds what has an API and a lifecycle
  (machines, Vault structure). Ansible does what has an order and a moment
  (OS, services, init, rotation, rolling changes, people, proof).
- **The contracts.** `lab_nodes`, the inventory resources, the platform
  outputs Ansible validates against, and the token files are the interfaces;
  nothing else crosses between the tools.
- **The gates.** A run is not done when the tools exit 0. It is done when a
  second run changes nothing, every plan is empty, no secret is found in
  state or logs, and validation proves the system from the outside.
- **The boundary in Vault.** Neither tool can do the other's job, because its
  token cannot.

## What a production estate adds

- Remote, locked, encrypted state; no local `terraform.tfstate`.
- Separate workspaces (or projects) per environment, with promotion between
  them instead of `make lab` on one machine.
- Human approval on plans that destroy or replace, and on the seal key and
  `secret/` (in the lab, Vault policy already refuses Terraform those deletes).
- Audit devices on Vault and centralised logs, so the evidence also lives
  outside the systems it describes.
