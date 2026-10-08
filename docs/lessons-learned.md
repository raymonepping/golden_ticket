# Lessons learned

The traps found while building red_pass and golden_ticket, each with the fix
that is now in the automation. Most are not specific to this lab. The
golden_ticket-specific evidence for each Terraform/Ansible finding is in
[decisions.md](decisions.md).

## Multipass on macOS

- **Launching a VM while another runs fails** with `Failed to get shared "write"
  lock`. Multipass caches `file://` images by *content* and resolves them
  through the disk of the last instance created from it — which is running and
  locked. Fix: launch each VM from its own APFS clone (`cp -c`) with a few
  bytes appended after the last qcow2 cluster.
- **`multipassd` cannot read `~/Documents`** (macOS privacy, TCC). The clones
  live in `/Users/Shared/gt-images`.
- **`/etc/hosts` is rewritten on every boot** (`manage_etc_hosts: true` in
  Multipass vendor-data). Manage `/etc/cloud/templates/hosts.redhat.tmpl` too.
- **`multipass restart` can exit non-zero after the guest has rebooted.** Report
  command result and readiness separately.
- **Disk size is the EFI partition** for these RHEL images; read `df /` in the guest.
- **Clocks drift minutes behind after the Mac sleeps.** Tokens look expired,
  fresh certificates look "not yet valid". Fix: chrony `makestep 1.0 -1`,
  `maxpoll 6`, `chronyc waitsync` with a restart as rescue, certificates
  issued with `notBefore` one hour back.
- **1 GB VMs cannot run `dnf`** against full RHEL repo metadata (OOM-killed): 2 GB.
- **Monotonic systemd timers stall while the Mac sleeps** (`OnUnitActiveSec=6h`
  ran 15 h late; `Persistent=` only applies to `OnCalendar=`). Use a wall-clock
  `OnCalendar=` with `Persistent=true`: the missed slot fires after wake.

## Terraform with Ansible

- **The Multipass provider cannot launch in parallel from one image**: the
  content cache makes a 10 GiB image inherit a 20 GiB minimum from an old
  instance's disk, or fail on a write lock. Per-node clones (D1), and at most
  two launches at a time (multipassd's copy step fails beyond that, D6).
- **`ansible_playbook` with `replayable = false` does not re-run when
  `extra_vars` change** — it only updates the stored attributes. Re-run on
  content with `replace_triggered_by` a `terraform_data` holding the digest
  (D2). multi_pass's digest never triggered anything; its `make lab` forced
  `-replace` every time.
- **The playbook's stdout lands in state**, and state files are created
  `0644`. Every credential task is `no_log`; `tf-run.sh` forces `0600`; the
  secret scan covers state.
- **`cloud.terraform` 4.0.0 breaks on ansible-core 2.21** (`get_bin_path()`
  keyword) unless the plugin config sets an absolute `binary_path` (D3).
- **`terraform console` evaluates locals against state** — useless for
  reading the node map after a partly failed apply. The map lives in
  `nodes.auto.tfvars.json`, read by Terraform and Ansible alike (D7).
- **Vault stores `token_bound_cidrs` `x/32` as `x`**; provider 5.11.0
  normalises it, and only `/32` avoids its "invalid CIDR" warning (D8).
- **A data source scoped inside a `check` block is always re-read at apply**,
  so `plan -detailed-exitcode` is never clean; read it outside, assert inside
  (D10).
- **`prevent_destroy` lives in the block it protects**: deleting the block
  deletes the protection. Real protection is Vault policy (no `delete` for
  Terraform's token on `secret/`) — D11.
- **The Multipass provider does not refresh sizing** from the live VM; a hand
  resize leaves the plan empty. Ansible's `sizing` check compares the guest
  with the inventory (D13).
- **A token role bound to the console's address refuses the console** when it
  reads Vault through the front door: Vault sees the proxy. Bind to both.
- **Health checks against a realm that does not exist yet** keep the backend
  DOWN; check the master realm (the proxy comes before identity here).

## RHEL and containers

- **Podman's published ports bypass firewalld** (netavark DNAT). A
  "proxy-only" rich rule did nothing for Keycloak until the containers moved
  to host networking.
- **Podman secrets mount `0444` by default** inside the container; set
  `mode=0400` in the Quadlet `Secret=` line.
- **OpenLDAP answers "No such object"** to anonymous reads of a protected
  base. Probe the root DSE (`namingContexts`) for readiness.

## Vault Enterprise

- `sys/init` over HTTP returns `keys_base64` / `recovery_keys_base64` (the CLI
  prints `unseal_keys_b64`).
- A transit-sealed node exits at start while its seal is unreachable: a
  fail-fast `ExecStartPre` guard with `Restart=always` keeps boot moving.
- Enterprise standbys are **performance standbys**: bare `sys/health` returns
  473; "any unsealed node" checks need `standbyok&perfstandbyok`.
- A JWT/OIDC mount with `oidc_client_id` refuses JWT logins — add `auth/jwt`.
- External groups carry one alias each — one group per mount.
- AppRole stores `token_bound_cidrs` `x/32` as `x`; normalise before comparing.
- The JWT login response leaves `identity_policies` empty; ask `lookup-self`.
- A token that may write `gt-*` policies could rewrite its own — every
  bootstrap policy denies writes to `gt-tf-*` and `gt-ansible-*`.

## Keycloak

- Passing `mappers:` to a user federation replaces the defaults: declare the
  username/e-mail/name mappers or logins fail with "null username".
- Keycloak stores `multivalued: "true"` on group mappers; declare it or every
  run reports a change.
- `keycloak_realm` always PUTs an existing realm and reports "changed" when
  the realm differs afterwards; the first PUT after creation makes Keycloak
  fill in defaults. A fresh realm therefore reported one change on the next
  run. Apply it a second time in the run that created it (`changed_when:
  false`).

## OpenLDAP (osixia image)

- The image chowns its certificate directory to its `openldap` user
  (uid 911) on every start. Declare that owner, or every container restart
  shows up as drift on the next run.
- The issuer must be fixed (Vault checks it). Moving it to the front door is
  one variable and one converge.

## HAProxy

- `http-request` rules run before `use_backend`: a frontend-level deny refused
  every `/node/…` path; a default 404 backend does not.
- RHEL's socket path is `/var/lib/haproxy`, not `/run/haproxy`.
- Health-check semantics leak into the UI: "DOWN" on the write path is a
  healthy standby.

## Ansible

- **`no_log` does not censor every failure line**: a malformed URL built from
  a variable printed its value on ansible-core 2.21's `[ERROR]` line (D12).
  Secrets go only in headers and bodies; role-prefixed variable names
  (ansible-lint) prevent the collision that caused it.
- **Some modules cannot prove themselves in check mode**
  (`keycloak_user_federation` reports changed on a converged realm); skip
  them in check mode and rely on the real-run idempotency gate (D14).
- **A folded YAML scalar (`>-`) does not process escapes**: `'\\1'` stays two
  backslashes; inside `>-` a back-reference is `'\1'`.
- **`ansible-galaxy` skips a pinned collection another path already
  satisfies** (the Homebrew bundle), so force-install into the project cache.
- **Handlers cannot be `include_role`**; inline a `systemctl try-restart`
  (restart only what already runs).
- **`systemctl try-restart` fails (rc 5) when the unit is not installed yet.**
  Every converged re-run passed; only the from-nothing rebuild hit it, when
  `vault_install`'s handler fired before `vault_configure` had written the
  unit. Accept rc 5 as "nothing to restart". Rebuild from nothing before
  calling a lab done.
- A delegated `run_once` task registers on the **inventory host**, not on localhost.
- YAML mapping keys are not templated (`"{{ var }}": …`); build such dicts in Jinja.
- Dynamic `include_role` does not pass `--tags` to its tasks; use `apply: tags`.
- `failed_when: false` also overwrites `failed`; judge by the message.
- `default([])` does not replace `null`; use `default([], true)`.
- `--syntax-check` cannot template `hosts:` from hostvars; `add_host` into a group.

## Process

- Prove each layer on its own before connecting it to the next.
- Write the readiness contract first; let `make validate` find the next bug.
- Reruns must be `changed=0`; every exception is a bug or a documented sync.
- The Bash tool's zsh does not word-split `$LIST`; use arrays when moving files
  aside before an "add everything" commit — and in health-check loops.
- Prove a protection by trying to break it (apply the destroy, ask the token
  what it may do, open the port forward), not by reading its configuration.
