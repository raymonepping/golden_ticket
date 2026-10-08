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

## Cold start (all VMs stopped)

1. `multipass start gt-…` (or start them in any order).
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
