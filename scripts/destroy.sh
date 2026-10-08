#!/usr/bin/env bash
# make destroy — demolish the house: only the gt-* VMs (terraform/infra).
# The seal Vault and the cluster die with their VMs, so the seal/platform
# Terraform states are archived (never `terraform destroy`ed: prevent_destroy
# guards their critical resources). Controller secrets are kept; the reset
# steps for a fresh lab are printed.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd terraform
require_cmd jq

names="$(jq -r '.nodes | keys | join(" ")' "${TF_DIR}/infra/nodes.auto.tfvars.json")"
printf 'This permanently deletes: %s\n(and their Vault data). Other Multipass VMs are never touched.\n' "${names}" >&2
printf 'Consider first: CONFIRM_RHSM_UNREGISTER=yes make rhel-unregister\n' >&2
if [[ "${CONFIRM_DESTROY:-}" != yes ]]; then
  [[ -t 0 ]] || die "Non-interactive: set CONFIRM_DESTROY=yes."
  read -r -p "Type 'destroy' to continue: " answer
  [[ "${answer}" == destroy ]] || die "Destroy cancelled."
fi

"${SCRIPT_DIR}/tf-run.sh" infra destroy -auto-approve

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="${SECRETS_DIR}/archive/${stamp}"
umask 077
mkdir -p "${archive}"
for root in seal platform; do
  for f in "${TF_DIR}/${root}"/terraform.tfstate*; do
    [[ -e "${f}" ]] || continue
    mkdir -p "${archive}/${root}"
    mv "${f}" "${archive}/${root}/"
  done
done
info "Archived the seal/platform Terraform state to ${archive#"${ROOT_DIR}"/}"
cat >&2 <<STEPS

For a completely fresh lab, also move these aside (they belong to the
destroyed Vaults and would block a new init):
  .secrets/seal-init.json  .secrets/vault-init.json  .secrets/tokens/
  .secrets/tls/gt-*.{crt,key}   (node certificates; the lab CA can stay)
  .secrets/ansible/known_hosts  .build/
Then: make lab
STEPS
