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

destroy: ## Destroy ONLY the gt-* VMs (Terraform confirmation)
	@echo "Terraform will propose destroying only the gt-* VMs in terraform/infra."
	@echo "Consider 'CONFIRM_RHSM_UNREGISTER=yes make rhel-unregister' first."
	$(TF) infra destroy

rhel-unregister: ## Unregister the gt-* guests from RHSM (CONFIRM_RHSM_UNREGISTER=yes)
	$(RUN) rhel-unregister
