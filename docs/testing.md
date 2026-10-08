# Testing

Every gate, what it proves and how to run it. `make lab` runs the starred
ones itself and refuses to write the convergence stamp unless they pass.

| Gate | Command | Proves |
| --- | --- | --- |
| Static ★ | `make check` | tools present; `bash -n` + ShellCheck on every script; `terraform fmt -check`, `validate` and `terraform test` (mock providers) on every root; `ansible-playbook --syntax-check`; `ansible-lint` production profile; the `gt_stats` callback unit tests; nothing secret or generated tracked by Git |
| Idempotency ★ | `make idempotency` | every Ansible phase re-run reports `changed=0` (exceptions only from `scripts/idempotency-allow.txt`, each with a reason) |
| Terraform drift ★ | `TF_ONLY=1 ./scripts/drift.sh` | `plan -detailed-exitcode` is 0 on `infra`, `seal`, `platform` |
| Secret scan ★ | `make secret-scan` | no known secret value and no secret-shaped pattern in state, `.build/`, logs |
| Validation ★ | `make validate` | the system from the outside: per node (SELinux, swap, exact firewall per role, clock, sizing vs Terraform, baseline digest, Vault service/TLS/init/seal/seal type), cluster (one active, 3 voters, licence), platform (everything Terraform declared exists), token boundary, seal chain (key, agent token, rotation age, exactly one secret-id, no seal credential on the cluster), identity (11 rows), front door (11 rows) |
| Full drift | `make drift` | Terraform plans **and** `--check --diff` on every Ansible phase (D14: what check mode cannot prove) |
| Token boundary | `make boundary` | 19 `sys/capabilities-self` checks across the four bootstrap tokens |
| People | `make identity-verify` | each person logs in through Keycloak and LDAP and gets exactly their policy; operator encrypts; viewer is refused a write |
| Failover | `make proxy-failover-test` | stop the active node → the front door serves the new leader; the node rejoins unsealed (changes state; never part of `make lab`) |
| Console | `make ui-check` | typecheck, lint, 103 unit tests, production build |
| Browser | `scripts/ui-signin-test.sh https://<proxy>` | sign-in + role gating for all three people, API refuses anonymous calls, axe WCAG 2.1 AA (0 violations) on every page at 1440×900 and 390×844 |
| Vault UI OIDC | `scripts/ui-signin-test.sh https://<proxy>:8200 e2e/vault-oidc.spec.ts` | raymon signs in to the Vault UI through Keycloak via the front door |

## Unit and contract tests

- `terraform/infra/tests` — the `nodes` validations reject a wrong topology;
  `lab_nodes` keeps its shape; inventory groups and host variables.
- `terraform/seal/tests` — AppRole CIDRs come from the agent's address; the
  key is non-exportable and undeletable.
- `terraform/platform/tests` — engines follow the licence (mounted / skipped
  with reason); built-ins never; undeclared namespaces and bootstrap policies
  rejected; the console token role binding.
- `tests/test_gt_stats.py` — the callback writes counts only.
- `ux/tests` — ownership from Terraform's contract (provisioned / unmanaged /
  unknown), baseline evidence, layers and engines-plan parsing (unknown is
  never green), VM-mode 405s, session and PKCE, redaction.

The recorded results of the resilience and drift proofs are in
[operations.md](operations.md).
