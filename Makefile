SHELL := /bin/bash
RUN   := ./scripts/ansible-run.sh
TF    := ./scripts/tf-run.sh
# multipassd fails "Failed to copy" when many file:// launches copy images at
# once (docs/decisions.md D6); two at a time is proven.
INFRA_PARALLELISM ?= 2

.DEFAULT_GOAL := help

help: ## Show targets
	@awk 'BEGIN{FS=":.*## "} /^[a-z0-9-]+:.*## /{printf "  \033[1m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ── Foundation (prompt 02) ───────────────────────────────────────────────────
.PHONY: help check deps tf-init preflight images infra-plan infra inventory ping baseline baseline-rerun destroy rhel-unregister

check: deps ## Static checks: tools, ShellCheck, terraform fmt/validate/test, ansible syntax + lint, tracked secrets
	./scripts/check.sh

deps: ## Install pinned Ansible collections into .cache
	./scripts/ansible-deps.sh

tf-init:
	$(TF) infra init

preflight: deps tf-init ## Controller checks, SSH key; refuses while red_pass/multi_pass VMs run
	$(RUN) preflight

images: ## Per-node image clones for missing VMs (Multipass content-cache workaround)
	$(RUN) images

infra-plan: preflight images ## Plan the VMs, inventory and baseline
	$(TF) infra plan

infra: preflight images ## Terraform: 8 VMs + inventory + RHEL baseline (one apply)
	$(TF) infra apply -parallelism=$(INFRA_PARALLELISM)
	CLEANUP=1 $(RUN) images

inventory: ## Show the Ansible inventory read from Terraform state
	@source ./scripts/ansible-env.sh && ansible-inventory --graph </dev/null

ping: ## Verified SSH ping of every VM (Terraform inventory, strict host keys)
	$(RUN) ping

baseline: ## Run the RHEL baseline from Make (Terraform inventory) — expect changed=0
	$(RUN) baseline -e baseline_digest="$$($(TF) infra output -raw baseline_digest)"

baseline-rerun: ## Force Terraform to re-run the baseline (the only forced run)
	$(TF) infra apply -parallelism=$(INFRA_PARALLELISM) -replace=ansible_playbook.baseline

destroy: ## Destroy ONLY the gt-* VMs (confirmation), archive the Vault roots' state
	./scripts/destroy.sh

rhel-unregister: ## Unregister the gt-* guests from RHSM (CONFIRM_RHSM_UNREGISTER=yes)
	$(RUN) rhel-unregister

# ── Vault convergence and the seal Vault (prompt 03) ─────────────────────────
.PHONY: converge seal-init unseal status boundary

converge: deps ## Ansible: baseline again (changed=0), probe, Vault install/TLS/licence/config (TAGS=...)
	$(RUN) converge

seal-init: ## Ansible: seal Vault init (Shamir 1/1), unseal, tf-seal + ansible-seal tokens
	$(RUN) seal-init

unseal: ## Unseal gt-vault-s (one key); the cluster then auto-unseals through the agent
	$(RUN) unseal

status: ## vault status for every Vault node
	./scripts/status.sh

boundary: ## Prove each bootstrap token can do only its own tool's job (sys/capabilities-self)
	./scripts/boundary-check.sh

# ── The seal chain (prompt 04) ───────────────────────────────────────────────
.PHONY: seal-plan seal agent bootstrap seal-rotate

seal-plan: ## Plan the seal Vault's structure (gt-tf-seal token)
	$(TF) seal plan

seal: ## Terraform: transit mount + autounseal key, seal policies, AppRole roles
	$(TF) seal apply

agent: ## Ansible: secret-ids, Vault Agent (mTLS proxy) + rotator, proven from a cluster node
	$(RUN) agent

bootstrap: ## Ansible: start the cluster, init (recovery keys), raft join, tf-platform + ansible-platform tokens
	$(RUN) bootstrap

seal-rotate: ## Rotate the seal agent's secret-id now (normally on the wall-clock schedule)
	multipass exec gt-agent-1 -- sudo systemctl start seal-rotator.service
	multipass exec gt-agent-1 -- sudo journalctl -u seal-rotator -n 3 --no-pager -o cat

# ── Vault structure, validation and the whole lab (prompt 05) ────────────────
.PHONY: platform-plan platform validate lab idempotency drift secret-scan digest layers

platform-plan: ## Plan the cluster's structure (gt-tf-platform token, active node)
	$(TF) platform plan

platform: ## Terraform: namespaces, mounts, secret/, engines, policies, token roles
	$(TF) platform apply

validate: ## Ansible: read-only end-to-end proof → .build/validation.json
	$(RUN) validate

lab: ## The whole lab: every phase of scripts/phases.txt, then idempotency, drift, secret scan, stamp
	./scripts/lab.sh

idempotency: ## Re-run every Ansible phase; each must report changed=0
	./scripts/idempotency.sh

drift: ## Read-only: terraform plan -detailed-exitcode per root + ansible --check per phase
	./scripts/drift.sh

secret-scan: ## Known secret values and secret-shaped patterns in state, .build/ and logs
	./scripts/secret-scan.sh

digest: ## Print the automation digest
	@./scripts/automation-digest.sh

layers: ## Rebuild .build/layers.json from the evidence
	./scripts/layers.sh
