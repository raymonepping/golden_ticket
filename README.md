# golden_ticket

Vault Enterprise on eight RHEL 9.8 ARM64 Multipass VMs on a Mac, built with
**Terraform and Ansible together**:

> **Terraform builds the house. Ansible decorates it.**

Terraform builds the machines and the structure inside Vault. Ansible does
everything that has an order and a moment: the operating system, the
services, init and unseal, the seal agent, the people, and the proof.

```text
make lab
  tf      infra      8 VMs · inventory as code · RHEL baseline (run by Terraform)
  ansible converge   Vault install/TLS/licence/config
  ansible seal-init  seal Vault: init 1/1, unseal, scoped tokens
  tf      seal       transit mount + autounseal key · policies · AppRole roles
  ansible agent      secret-ids · Vault Agent (mTLS proxy) · rotator
  ansible bootstrap  cluster init (recovery keys) · raft join · scoped tokens
  tf      platform   namespaces · mounts · engines · policies · token roles
  ansible validate   read-only end-to-end proof
  gates              idempotency (changed=0) · drift (plans empty) · secret scan
```

## Prerequisites

- Apple Silicon Mac, Multipass, Terraform ≥ 1.11, Ansible (core 2.21),
  `ansible-lint`, ShellCheck, `jq`, `openssl`, the Vault CLI.
- `/Users/Shared/rhel-9.8-aarch64-kvm.qcow2` (override with `GT_IMAGE`).
- `.env` (ignored) with `VAULT_LICENSE`, `RHSM_ORG`, `RHSM_ACTIVATION_KEY` —
  see `.env.example`. Values are exported to the processes that need them and
  never printed, never `extra_vars`, never Terraform variables.
- **Stop red_pass and multi_pass first** (`make down` in `../red_pass`). The
  Mac cannot hold two eight-VM labs; preflight refuses while their VMs run and
  never stops them itself.

## Use

```bash
make lab          # everything, then the gates; prints the resume target on failure
make status       # vault status of every Vault node
make drift        # read-only: terraform plan per root + ansible --check per phase
make boundary     # prove each tool's token can do only its own job
make help         # every target
```

After a cold start (all VMs stopped and started): `make unseal` — one key, for
the seal Vault; the agent and the cluster follow.

## Documentation

- [docs/architecture.md](docs/architecture.md) — ownership, the token
  boundary, phases, the contracts between the tools, the seal chain
- [docs/operations.md](docs/operations.md) — cold start, restarts, rotation,
  drift demos, teardown
- [docs/decisions.md](docs/decisions.md) — the evidence behind every
  non-obvious choice (proofs of concept, provider behaviour)

The complete README (people, front door, console) arrives with the final
prompt.

## License

[GPLv3](LICENSE)
