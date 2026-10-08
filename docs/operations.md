# Operations

## The seal chain

```text
gt-vault-s (Shamir 1/1) ── transit/keys/autounseal       structure: terraform/seal
     ▲  AppRole gt-seal-autounseal (policy autounseal, bound to the agent's /32)
     │  AppRole gt-seal-rotator    (mint/destroy secret-ids of the above only)
gt-agent-1  vault-agent  api_proxy use_auto_auth_token = "force"   ansible/agent.yml
            listener :8100, mTLS required, firewalld: cluster nodes only
            seal-rotator.timer  00/06/12/18 h, Persistent=true (wall clock)
     ▲  mTLS with each node's own certificate, no token
gt-vault-1..3  seal "transit" → https://gt-agent-1:8100        ansible/converge.yml
```

No cluster node holds a seal credential: no `seal.env`, no `VAULT_TOKEN`, no
token file. The `token` value in the seal stanza is a placeholder; the agent
replaces it on every request.

## Stop and start: `make down` / `make up`

`make down` stops (never deletes) the gt-* VMs: console, front door,
identity, the cluster (gt-vault-3 first), the seal agent, and the seal Vault
last. `make up` starts them the other way round and runs `make unseal`.
Names and roles come from `terraform/infra/nodes.auto.tfvars.json`. Proven
2026-10-08: `make down` → `make up` → `make validate` green.

## Cold start (all VMs stopped)

1. `make up`, or `multipass start gt-…` in any order, then step 3.
2. The cluster units sit in `activating`: their `ExecStartPre` guard
   (`/usr/local/bin/vault-wait-seal`) fails fast while the agent cannot reach
   an unsealed seal Vault, and systemd retries every 10 s. No crash loop.
3. `make unseal` — one key, for `gt-vault-s` only.
4. The agent re-authenticates with its AppRole secret-id, the guard passes,
   and the three cluster nodes unseal themselves; Raft elects a leader.

Recorded 2026-10-08: about 19 s from `make unseal` to all three unsealed. The
active node after the restart was `gt-vault-3`; `scripts/vault-addr.sh
platform` (used by `terraform/platform`) follows the active node instead of
assuming `gt-vault-1`.

## Restarts

| Restart | What happens |
| --- | --- |
| a cluster node | comes back unsealed by itself through the agent (≈ 15 s) |
| `gt-agent-1` | the cluster keeps serving (225/225 health checks 200 during the restart); the agent re-authenticates |
| `gt-vault-s` | comes back **sealed**; the running cluster keeps serving; `make unseal` |

## Rotation

`seal-rotator.timer` mints a new `gt-seal-autounseal` secret-id with the
rotator identity, replaces the file atomically and destroys every other
accessor. Recorded proof: after two rotations the old secret-id gets 400 and
the current one 200, and exactly one secret-id is valid. Run one now with
`make seal-rotate`.

## The token boundary

`make boundary` asks each of the four bootstrap tokens (sys/capabilities-self)
what it may do: Terraform's tokens can build structure but never mint a
secret-id, enable an auth method or read secret data; Ansible's tokens can
configure people and mint secret-ids but never create a mount or write a
policy; none can touch the bootstrap policies.

## Drift: who sees what (recorded 2026-10-08)

| Change | Seen by | Result |
| --- | --- | --- |
| `vault secrets disable -namespace=operations pki` | Terraform | `make drift`: `platform DRIFT Plan: 1 to add`; validation (check mode) fails too — the mount Terraform declared is missing. `make platform` restores it. |
| `totp` removed from `var.engines` | Terraform | `vault_mount.engine["totp"] will be destroyed (because key ["totp"] is not in for_each map)`; applied, put back, plan clean. |
| `secret/` resource block deleted | Terraform plans a destroy — **Vault refuses** | apply → `403 permission denied` (`gt-tf-platform` has no delete on `sys/mounts/secret`); `secret/` still mounted; see decisions D11. |
| `log_level = "debug"` in `/etc/vault.d/vault.hcl` on `gt-vault-2` | Ansible | `make drift`: `converge DRIFT would change: gt-vault-2=1`; `make converge` renders the file once and try-restarts only `gt-vault-2`. |

`make drift` is read-only: `terraform plan -detailed-exitcode` on every root
and `--check --diff` on every Ansible phase, one table. `make idempotency`
really re-runs every Ansible phase and fails on any `changed > 0`.

## Teardown

`make destroy` asks for confirmation (or `CONFIRM_DESTROY=yes`), destroys only
the `gt-*` VMs through `terraform/infra`, and archives the seal/platform state
to `.secrets/archive/<timestamp>/` — those Vaults died with their VMs, and the
critical resources are never `terraform destroy`ed. It prints the reset steps
for a completely fresh lab. `make rhel-unregister` is separate and explicit.

## The front door (gt-proxy-1)

| URL | What |
| --- | --- |
| `https://<proxy>:8200` | Vault UI + API, writes — the active node only (`/v1/sys/health` = 200) |
| `https://<proxy>:8202` | Vault reads — any unsealed node (`standbyok&perfstandbyok`) |
| `https://<proxy>:8210` | the seal Vault (operator only) |
| `https://<proxy>/` | the console (prompt 08) |
| `https://<proxy>:8443` | Keycloak, the issuer everyone trusts (prompt 07) |
| `https://<proxy>:9000/node/<name>/…` | one specific node, also when sealed (diagnosis) |
| `https://<proxy>:8404/stats` | HAProxy stats, user `stats`, password in `secret/golden-ticket/proxy` |

`make status` prints the node addresses; the proxy address is in
`terraform -chdir=terraform/infra output -json lab_nodes`. Optional, never
applied by automation: a Mac `/etc/hosts` line
`<proxy> vault.golden-ticket.lab ui.golden-ticket.lab id.golden-ticket.lab`
(the proxy certificate carries those names).

**Failover test** (`make proxy-failover-test`, never part of `make lab`):
stops Vault on the active node, waits for the front door to serve the new
leader, starts the node again and waits for three Raft voters. Recorded
2026-10-08: old active `gt-vault-3` stopped → the front door served
`gt-vault-1` after about 2 s → `gt-vault-3` came back unsealed (through the
seal agent) as a standby.

## The console (gt-ux-1)

`https://<proxy>/` — sign in with Keycloak (raymon admin, barend operator,
viewer viewer; `make identity-show-user PERSON=<uid>`). Observe-only in the
VM: lifecycle actions return 405 and are not rendered; use the host console
(`make ui-start-auth`, 127.0.0.1:3310) for start/stop/restart.

| Page | Evidence |
| --- | --- |
| Fleet | live probes + seal chain (seal Vault → agent → cluster) |
| Layers | `.build/layers.json`: each phase of `scripts/phases.txt` tagged Terraform or Ansible, plan results, recap counts, the four gates, the automation digest |
| Engines | live `sys/mounts` in namespace `engines` (narrow token issued through Terraform's `gt-ui-engines` role) + Terraform's skipped engines and reasons |
| Virtual machines | four indicators per VM: Provisioned (Terraform `lab_nodes`), RHEL healthy (incl. the baseline Terraform applied), Ansible converged (digest), Vault secured / Service |
| Front door | live HAProxy backends |

`make lab` pushes the final evidence after the stamp (`make ux-sync` does it
by hand). Recorded 2026-10-08: change a comment in any `.tf` file → after a
sync every VM shows Ansible **Outdated** and the Layers hero names the applied
vs current digest; revert + `make lab` → all 32 indicators green. Browser
checks: `scripts/ui-signin-test.sh https://<proxy>` (sign-in, role gating,
axe WCAG 2.1 AA on every page at 1440×900 and 390×844: 0 violations) and
`scripts/ui-signin-test.sh https://<proxy>:8200 e2e/vault-oidc.spec.ts`
(Vault UI OIDC login through the front door).

The probe key works only as a forced command from gt-ux-1: from the Mac it is
refused; from gt-ux-1 any command returns the probe output; a port forward is
refused ("administratively prohibited").

## Proofs (prompt 09, recorded 2026-10-08)

### Resilience

| Proof | Command | Result |
| --- | --- | --- |
| Leader failover | `make proxy-failover-test` | front door served the new leader ~2 s after the active node stopped; the old leader rejoined unsealed as a standby |
| Node reboot | `multipass restart gt-vault-2` | back unsealed by itself through the agent (boot confirmed with `uptime -s`) |
| Agent restart | `multipass restart gt-agent-1` while polling every node each second | 180 / 180 health checks 200; the agent re-authenticated |
| Rotation | `make rotation-proof` | old secret-id login 200 → after two rotations 400; current 200; exactly one valid secret-id |
| Seal Vault restart | `multipass restart gt-vault-s` → `make unseal` | came back sealed; the cluster kept answering 200; one key unsealed it |
| Cold start | stop all eight → start → `make unseal` | (prompt 04) cluster nodes waited in `activating`; ~19 s after `make unseal` all three unsealed |
| Mac sleep | sleep the Mac ≥ 10 min, wake | **operator-run** — needs the Mac itself to sleep; chrony `makestep 1.0 -1` + `waitsync` and certificates with notBefore −1 h are in place |
| Sleep across a rotation slot | sleep past 00/06/12/18 h, wake | **operator-run** — the timer is `OnCalendar=*-*-* 00/6:00:00` with `Persistent=true` (verified with `systemctl cat`); validation's "rotated within 7 h" proves the catch-up |

### Drift, one per tool

| Change | Seen by | Result |
| --- | --- | --- |
| Mount disabled by hand | Terraform | platform plan: 1 to add; `make platform` restores (prompt 05) |
| Mount removed from code | Terraform | plan shows the destroy (prompt 05) |
| `secret/` block removed from code | Terraform plans it — **Vault refuses** | 403; mount survives (D11) |
| VM deleted outside Terraform (`multipass delete --purge gt-ux-1`, after `rhel-unregister` for that node) | Terraform | infra plan: create `gt-ux-1`, update its inventory host, re-run the baseline; `make lab` rebuilt and re-furnished it on a new address and propagated it (proxy, Keycloak, token role, probe key) |
| VM resized by hand (`memory=3G`) | **not Terraform** (provider does not refresh sizing) — **Ansible** | plan stayed empty; `make validate` failed "Sizing matches Terraform" on `gt-ux-1` only; reverted → pass (D13) |
| `vault.hcl` edited on a node | Ansible | check mode on `converge`; `make converge` restores with one try-restart (prompt 05) |
| Keycloak client changed in the admin API (stray web origin on `gt-ui`) | Ansible | check mode: "Ensure the OIDC clients" would change; `make identity` restored it |
| Person added to another LDAP group (`viewer` → `gt-operators`) | Vault + validation | `identity-verify` failed exactly: viewer JWT and LDAP logins `gt-operator,gt-viewer`, viewer KV write HTTP 200; `make identity` restored exact membership → 11/11 |

### From nothing (final gate, 2026-10-08)

`make rhel-unregister` → `make destroy` → reset steps → `make lab`, green in
17 min 12 s (phase start to next phase start):

| Phase | Tool | Time |
|---|---|---|
| infra: preflight, image clones, 8 VMs, RHEL baseline | Terraform (+ Ansible inside) | 6 min 05 s |
| converge | Ansible | 58 s |
| seal-init | Ansible | 23 s |
| seal | Terraform | 2 s |
| agent | Ansible | 24 s |
| bootstrap | Ansible | 35 s |
| platform | Terraform | 2 s |
| proxy | Ansible | 23 s |
| identity | Ansible | 2 min 20 s |
| ux (including the console build) | Ansible | 1 min |
| validate | Ansible | 57 s |
| gates: idempotency, drift, secret scan | both | 4 min |
| **total** | | **17 min 12 s** |

The first two from-nothing attempts failed on bugs no converged re-run could
show (Vault restart handler on a missing unit; OpenLDAP certificate
directory owner; first update of a new Keycloak realm); see
[lessons-learned.md](lessons-learned.md). The third attempt above ran after
the fixes, from a fresh destroy.
