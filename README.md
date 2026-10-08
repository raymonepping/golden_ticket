# golden_ticket

Vault Enterprise on eight RHEL 9.8 ARM64 Multipass VMs on a Mac, built with
**Terraform and Ansible together**, each doing what it is best at:

> **Terraform builds the house. Ansible decorates it.**

Terraform builds the machines and the structure inside Vault: VMs,
inventory, the seal Vault's Transit key and AppRole roles, namespaces,
mounts, engines, policies, token roles. Ansible does everything that has an
order and a moment: the operating system, Vault itself, init and unseal, the
seal agent and its rotation, the front door, the people, the console, and the
proof.

It is the third lab in a series: [multi_pass](https://github.com/raymonepping/multi_pass)
(Terraform around Ansible) and [red_pass](https://github.com/raymonepping/red_pass)
(Ansible only). golden_ticket keeps red_pass's lab and console and puts both
tools back where they are strongest.

```text
                         you (browser / CLI)  ──TLS──►  gt-proxy-1  HAProxy front door
        ┌───────────────────────┬──────────────────────┬───────────────────────┐
  gt-vault-1..3           gt-vault-s           gt-identity-1             gt-ux-1
  Raft, transit seal      seal Vault           OpenLDAP + Keycloak       console
        │ mTLS, no token       ▲
        └──► gt-agent-1 ───────┘  Vault Agent (AppRole), wall-clock secret-id rotation
```

## One command

```bash
make lab
```

```text
 1  tf      infra      8 VMs · inventory as code · RHEL baseline (run by Terraform)
 2  ansible converge   Vault install / TLS / licence / config
 3  ansible seal-init  seal Vault: init 1/1, unseal, scoped tokens
 4  tf      seal       transit mount + autounseal key · policies · AppRole roles
 5  ansible agent      secret-ids · Vault Agent (mTLS proxy) · rotator
 6  ansible bootstrap  cluster init (recovery keys) · raft join · scoped tokens
 7  tf      platform   namespaces · mounts · engines · policies · token roles
 8  ansible proxy      HAProxy front door
 9  ansible identity   OpenLDAP + Keycloak · Vault auth wired to Terraform's policies
10  ansible ux         the console on gt-ux-1
11  ansible validate   read-only end-to-end proof
    gates              idempotency (changed=0) · Terraform drift (plans empty) · secret scan
```

On failure it prints the exact phase to resume. A second `make lab` changes
nothing: every plan is empty and every Ansible phase reports `changed=0`.

## Prerequisites

- Apple Silicon Mac (48 GB is comfortable: the lab asks for 24 GB), Multipass,
  Terraform ≥ 1.11, Ansible (core 2.21), `ansible-lint`, ShellCheck, `jq`,
  `openssl`, the Vault CLI, Node.js 22+ (console build).
- `/Users/Shared/rhel-9.8-aarch64-kvm.qcow2` (override with `GT_IMAGE`).
- `.env` (ignored) with `VAULT_LICENSE`, `RHSM_ORG`, `RHSM_ACTIVATION_KEY` —
  see `.env.example`. Never printed, never `extra_vars`, never a Terraform
  variable.
- **Stop red_pass and multi_pass first** (`make down` in `../red_pass`).
  Preflight refuses while their VMs run; golden_ticket never touches them.

## Using it

| | |
| --- | --- |
| Console | `https://<proxy>/` (sign in as raymon / barend / viewer; `make identity-show-user PERSON=raymon`) |
| Vault UI + API | `https://<proxy>:8200` (OIDC through Keycloak) |
| Proxy address | `terraform -chdir=terraform/infra output -raw proxy_address` |
| Trust the lab CA in macOS | `make trust` |
| Status | `make status` |
| Drift (read-only) | `make drift` |
| Tool boundary | `make boundary` |
| After a cold start | `make unseal` (one key, for the seal Vault; the rest follows) |
| Teardown | `make destroy` (only the `gt-*` VMs) |
| Everything else | `make help` |

## The boundary is enforced by Vault

Each tool has its own token, with its own policy, on each Vault. Terraform's
can build structure but cannot mint a secret-id, enable an auth method, read
secret data or delete `secret/`. Ansible's can configure people and mint
secret-ids but cannot create a mount or write a policy. `make boundary` proves
it on every run.

## Documentation

- [docs/architecture.md](docs/architecture.md) — ownership, the token
  boundary, phases, the contracts between the tools, the seal chain, the edge
- [docs/operations.md](docs/operations.md) — cold start, restarts, rotation,
  the front door, the console, drift proofs, teardown
- [docs/identity.md](docs/identity.md) — people, Keycloak, LDAP, Vault auth
- [docs/security-model.md](docs/security-model.md) — the secret boundary per
  tool, what is in each state file, network
- [docs/testing.md](docs/testing.md) — every gate and how to run it
- [docs/decisions.md](docs/decisions.md) — the evidence behind every
  non-obvious choice (proofs of concept, provider behaviour)
- [docs/enterprise.md](docs/enterprise.md) — how the lab maps onto an
  enterprise estate (HCP Terraform, AAP, dynamic credentials)
- [docs/substrate-contract.md](docs/substrate-contract.md) — what a second
  substrate (vSphere, Proxmox, cloud) must produce
- [docs/lessons-learned.md](docs/lessons-learned.md) — the traps, with fixes
- [DESIGN.md](DESIGN.md) — the console's design (Vault daylight glass)

## License

[GPLv3](LICENSE)
