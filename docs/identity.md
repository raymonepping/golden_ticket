# Identity

People come from one directory and reach Vault and the console through
Keycloak or LDAP. The split follows the house rule:

- **Terraform** (`terraform/platform`) builds the rooms: the policies people
  get (`gt-admin`, `gt-operator`, `gt-viewer`), the `secret/` mount that holds
  the generated secrets, and the `gt-demo` Transit key the operator uses.
- **Ansible** (`ansible/identity.yml`: roles `identity_secrets`,
  `identity_stack`, `vault_identity`) hangs the doors: the directory,
  Keycloak, the Vault auth methods and the identity groups that connect people
  to Terraform's policies. These stay Ansible's because their configuration
  carries secrets (the OIDC client secret, the LDAP bind password) that must
  never enter Terraform state.
- Proven by `ansible/identity-verify.yml` (role `identity_verify`), also part
  of `make validate`.

## Components

| Component | Where | Notes |
| --- | --- | --- |
| OpenLDAP (`osixia/openldap:1.5.0`, digest-pinned, arm64) | gt-identity-1, Podman Quadlet, host network | base `dc=golden-ticket,dc=lab`; LDAPS 636 (lab-CA cert) only from the cluster; read-only bind `cn=readonly` |
| Keycloak 26.6.4 (digest-pinned, arm64) | gt-identity-1, Podman Quadlet, host network | realm `golden-ticket`, issuer `https://<proxy>:8443/realms/golden-ticket` from day one; 8443 only from the front door; `--db=dev-file` |
| Vault `auth/oidc` | cluster | browser and `vault login -method=oidc`; client `vault`; role `default` |
| Vault `auth/jwt` | cluster | Keycloak id_tokens presented directly; role `cli` (lab) |
| Vault `auth/ldap` | cluster | `ldaps://gt-identity-1:636`, CA-verified, `groupOfNames` filter |
| Console BFF | gt-ux-1 | client `gt-ui`, Authorization Code + PKCE (prompt 08) |

`auth/jwt` exists because a mount with `oidc_client_id` set refuses direct
JWT logins. Vault external groups take one alias each, so every directory group
has three external groups: `oidc-<group>`, `jwt-<group>`, `ldap-<group>`.

Host networking is deliberate: Podman's published ports are DNAT'd past
firewalld's input rules, so with host networking firewalld is the real gate.

## Directory and roles

Defined in `ansible/group_vars/all.yml` (`identity_users`, `identity_groups`):

| Person | LDAP group | Keycloak `groups` claim | Vault policy (Terraform) | Console role |
| --- | --- | --- | --- | --- |
| raymon | gt-admins | gt-admins | gt-admin | admin |
| barend | gt-operators | gt-operators | gt-operator | operator |
| viewer | gt-viewers | gt-viewers | gt-viewer | viewer |

`vault_identity` never writes a policy (its token cannot): it asserts that each
one exists and fails with "they are Terraform's — run 'make platform'" if one
is missing.

## Flows

```text
Vault UI ──OIDC──► Keycloak (realm golden-ticket, via the front door) ──LDAP──► OpenLDAP
   ◄── id_token (groups) ── callback https://<proxy>:8200/ui/vault/auth/oidc/oidc/callback
   Vault: external group oidc-gt-admins → policy gt-admin (Terraform's)

Console ──Authorization Code + PKCE (BFF)──► Keycloak
   The server verifies the id_token and keeps {name, role} in an encrypted
   httpOnly cookie. No token reaches the browser.

vault login -method=ldap ──LDAPS bind──► OpenLDAP; groups → ldap-<group> → policy
```

## Secrets

Generated once by `identity_secrets` into `secret/golden-ticket/identity`
(Ansible's own token; the mount is Terraform's and Vault refuses Terraform's
token deleting it): `ldap_admin_password`, `ldap_readonly_password`,
`keycloak_admin_password`, `vault_client_secret`, `ui_client_secret`,
`ui_session_password`, `user_<uid>` for every person. Containers receive them
as Podman secrets (never environment lines in unit files). `make
identity-show-user PERSON=<uid>` is the only command that prints one.
`make secret-scan` reads every value back and checks state, `.build/`, logs;
the unit files and `podman inspect` were scanned clean on 2026-10-08.

## Adding a person or group

1. A new group: add `policies/<policy>.hcl` and the name to
   `person_policies` in `terraform/platform` → `make platform`.
2. Edit `identity_users` (and `identity_groups` with that `policy` and a
   `ui_role`) → `make identity` (LDAP entry, password in KV, external groups).
3. `make identity-verify`.

## Checks (`make identity-verify`)

Eleven rows: Keycloak login per person, Vault JWT login per person with
**exactly** the expected identity policy, Vault LDAP login likewise, the
operator can encrypt with Terraform's `gt-demo` key, the viewer is denied a KV
write. Every token used is revoked at the end. All eleven passed on 2026-10-08.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "Invalid username or password" on `https://<proxy>:8443/` | that is the master-realm admin console (user `admin`); people live in realm `golden-ticket` — `/` redirects to `/realms/golden-ticket/account` |
| Keycloak 503 through the front door on the very first `make identity` | the health check must use the master realm (it always exists); the lab realm only exists after `identity.yml` creates it — through the front door |
| Sign-in fails with `JWTExpired` | guest clock drift after Mac sleep — `make converge TAGS=rhel` |
| Keycloak 500 "User returned from LDAP has null username" | attribute mappers missing in the federation — `make identity` restores them |
| Vault JWT login "unsupported config type" | JWT login sent to the OIDC mount — use `auth/jwt` |
