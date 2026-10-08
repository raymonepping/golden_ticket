# Security model

## The secret boundary, per tool

| Secret | Where it lives | Terraform | Ansible |
| --- | --- | --- | --- |
| Vault licence, RHSM org + activation key | ignored `.env`, exported to the processes that need them (`scripts/ansible-env.sh`) | never a variable or output; reaches the Terraform-run baseline only through the process environment | `lookup('env')` in `no_log` tasks; licence written straight to `/opt/vault/vault.hclic` (`root:vault 0640`) |
| Controller SSH key | `.secrets/ansible/id_ed25519` (`0600`) | reads the **public** half into cloud-init | uses the path |
| Lab CA + node keys | `.secrets/tls/` | never | issues and installs them |
| Seal Vault unseal key + root token | `.secrets/seal-init.json` | never | init once; root token used only to write the bootstrap policies, then break-glass |
| Cluster recovery keys + root token | `.secrets/vault-init.json` | never | same |
| Bootstrap tokens | `.secrets/tokens/{tf-seal,ansible-seal,tf-platform,ansible-platform}` | exported as `VAULT_TOKEN` for its own two (`tf-run.sh`) | uses its own two |
| Seal agent secret-ids | on `gt-agent-1` only (`vaultagent 0600`) | never — no `*_secret_id` resource | mints them (`gt-ansible-seal`), the rotator replaces them every 6 h |
| Identity secrets (LDAP, Keycloak, client secrets, people) | Vault KV `secret/golden-ticket/identity` | builds the `secret/` mount, can never read or delete it | generates and reads them (`gt-ansible-platform`); containers get Podman secrets (`0400`) |
| Proxy stats password | Vault KV `secret/golden-ticket/proxy` | never | generates it; HAProxy holds only its hash |
| Console engines token | `.secrets/ux/engines-token`, `gt-ux-1:/etc/gt-ux` | builds the token role (one policy, orphan, 720 h, bound to the console and the proxy) | issues it through that role |

## What is in Terraform state, and why that is acceptable

| Root | Contains | Not in it |
| --- | --- | --- |
| `infra` | VM attributes, the rendered cloud-init (public key only), inventory resources, **the baseline playbook's stdout** | RHSM values, the licence, private keys |
| `seal` | transit mount and key metadata (non-exportable key — no key material), policies, AppRole role definitions incl. **role-ids** (identifiers, not credentials) | secret-ids, tokens |
| `platform` | namespaces, mounts, policies, token role, **licence metadata** (feature names, expiry, licence id — D9) | the licence, any secret value, auth method config |

Every state file is forced to `0600` after each Terraform command; the secret
scan (`make secret-scan`) checks all state, backups and archives for every
known value (licence, RHSM, init material, tokens, secret-ids, identity and
proxy secrets) and for secret-shaped patterns (Vault tokens, the licence
header, PEM private keys with a body). It ran clean at the end of every
`make lab` on 2026-10-08.

The baseline playbook's output is the one place Ansible output lands in
Terraform state (D2). Every baseline task that touches a credential is
`no_log`; the scan covers it.

## The boundary between the tools is enforced by Vault

Each tool has its own token on each Vault, with a policy that permits its job
and nothing else (see [architecture.md](architecture.md)). `make boundary`
asks every token, via `sys/capabilities-self`, about 19 paths it must and
must not touch. Notable denials: Terraform can never mint a secret-id, enable
an auth method, read secret data or delete `secret/`; Ansible can never
create a mount or write a policy; neither can write a bootstrap policy.

## Network

| Port | Open to |
| --- | --- |
| Vault 8200/8201 | everyone on the lab network (cluster, controller, proxy) |
| Seal agent 8100 (mTLS required) | the three cluster nodes only (firewalld rich rules) |
| LDAPS 636 | the three cluster nodes only |
| Keycloak 8443 | the proxy only (Keycloak's management port 9000 is never opened) |
| Console 3443 | the proxy only |
| Front door 443/8200/8202/8210/8404/8443/9000 | everyone; TLS re-encrypted and verified to every backend |

Containers use host networking so firewalld is the real gate (Podman's
published ports bypass it). Direct access to the console, Keycloak and the
agent is refused; `validate.yml` proves it from the controller every run.

## The console

Server-side only (Nuxt BFF); sign-in with Keycloak (Authorization Code +
PKCE); the browser holds an encrypted `httpOnly` session cookie with a name
and a role, never a token. In VM mode it is observe-only (mutations 405) and
reads guests through a forced-command SSH key that runs one read-only probe,
only from `gt-ux-1` (no shell, no forwarding — proven). A secret scan of the
bundle, the evidence on the VM and the authenticated API responses was clean.

## Known limits (lab, not production)

- Local Terraform state on one Mac; no remote backend, locking or encryption
  at rest beyond the file mode.
- Root tokens are kept (break-glass) on the controller in `0600` files.
- The lab CA is a single local CA; no OCSP/CRL.
- `gt-cli` is a public client with direct grants (password flow) — used only
  by the verification tests.
