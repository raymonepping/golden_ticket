# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Built 2026-10-08 on branch `better-together`, one commit per prompt.

### Added
- **02 — Terraform builds the house:** `terraform/infra` (8 VMs from a typed
  node map in `nodes.auto.tfvars.json`, `ansible_host`/`ansible_group`
  inventory resources, the RHEL baseline as an `ansible_playbook` resource
  re-run by content digest via `replace_triggered_by`); the `cloud.terraform`
  inventory plugin for every later phase; per-node image clones; preflight
  that refuses while other labs run; proofs of concept in `docs/decisions.md`.
- **03 — Vault convergence and the seal Vault:** Vault install/TLS/licence/
  config ported from red_pass; seal Vault init; the four-token boundary
  (`gt-tf-*` structure, `gt-ansible-*` configuration) and `make boundary`.
- **04 — The seal chain:** `terraform/seal` (transit mount + undeletable,
  non-exportable key, policies, AppRole roles bound to the agent); the seal
  agent from day one (no seal token phase), wall-clock secret-id rotation;
  cluster bootstrap through the agent.
- **05 — Platform, validation, gates:** `terraform/platform` (namespaces,
  mounts, licence-aware engines, person/console policies, token role, a
  `check` block); `validate.yml` proving what Terraform declared; one phase
  list (`scripts/phases.txt`); `make lab` with idempotency, drift and secret
  gates; the `gt_stats` callback; `make destroy` that archives the Vault roots.
- **06 — Front door:** HAProxy on `gt-proxy-1`, before identity, so every
  public URL points at it from day one.
- **07 — People:** OpenLDAP + Keycloak; Vault oidc/jwt/ldap and external
  groups wired to Terraform's policies; identity secrets in Vault KV.
- **08 — Console:** red_pass's console on `gt-ux-1`, Provisioned from
  Terraform's `lab_nodes`, baseline evidence, the Layers page, Terraform's
  skipped engines.
- **10 — Article 04:** *Once, Twice, Three Times a Lab*, the closing article
  of the series (kept outside Git with the prompts); README links the series.
- **09 — Proofs and docs:** resilience and drift proofs, enterprise mapping,
  substrate contract, security model, testing, lessons learned.

### Fixed
- Vault restart handlers accept "unit not installed yet" (rc 5): found only by
  the from-nothing rebuild in the final gate.
- A freshly created Keycloak realm is settled in the same run; the OpenLDAP
  certificate directory is declared as the image's uid 911. Both made the
  first re-run after a from-nothing build report changes.
- Keycloak backend health on the master realm (the lab realm does not exist
  until identity runs through the front door).
- Console engines token role bound to the console **and** the proxy (Vault
  sees the proxy's address).
- Check mode no longer reports evidence pushes or the LDAP federation as
  drift (D14); sizing drift the provider cannot see is validated by Ansible
  (D13).

### Security
- Vault policy refuses Terraform deleting `secret/` (D11); every bootstrap
  policy denies writes to the bootstrap policies.
- OpenLDAP Podman secrets mounted `0400` (Podman's default is `0444`).
- State files `0600`; secret scan over state, logs, the console bundle, its
  evidence and API responses.
