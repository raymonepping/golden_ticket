#!/usr/bin/env bash
# Run Terraform for one root with the project environment.
#
#   scripts/tf-run.sh <infra|seal|platform> <init|plan|apply|drift|destroy|output|test> [args...]
#
# - The .env inputs are exported (never printed): the infra root's baseline
#   playbook runs as a Terraform subprocess and reads RHSM values from the
#   environment. Nothing ever goes through TF_VAR_*.
# - Vault provider credentials (seal/platform) come only from files under
#   .secrets/tokens, exported as VAULT_TOKEN for this process.
# - Every state file is forced to 0600 after each command.
# - drift = plan -detailed-exitcode: 0 clean, 2 drift, anything else error.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ansible-env.sh
source "${SCRIPT_DIR}/ansible-env.sh"

require_cmd terraform
root="${1:?usage: tf-run.sh <root> <action> [args...]}"
action="${2:?usage: tf-run.sh <root> <action> [args...]}"
shift 2
dir="${TF_DIR}/${root}"
[[ -d "${dir}" ]] || die "Unknown Terraform root: ${root}"

# Evidence for .build/layers.json: last apply / last plan result per root.
record() {
  mkdir -p "${BUILD_DIR}/terraform"
  local f="${BUILD_DIR}/terraform/${root}.json" now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  [[ -s "${f}" ]] || echo '{}' >"${f}"
  jq --arg k "$1" --arg v "$2" --arg now "${now}" '.[$k] = {result: $v, at: $now}' "${f}" >"${f}.tmp" && mv "${f}.tmp" "${f}"
}

secure_state() {
  find "${TF_DIR}" -maxdepth 2 -type f \( -name 'terraform.tfstate' -o -name 'terraform.tfstate.*' \) \
    -exec chmod 600 {} + 2>/dev/null || true
}
trap secure_state EXIT

# Vault provider environment for the Vault roots (address resolved by
# scripts/vault-addr.sh; token from the tool's own scoped token file).
case "${root}" in
seal | platform)
  if [[ "${action}" != "test" && "${action}" != "init" ]]; then
    token_file="${SECRETS_DIR}/tokens/tf-${root}"
    [[ -s "${token_file}" ]] || die "Missing ${token_file#"${ROOT_DIR}"/}: run the bootstrap phase first."
    VAULT_ADDR="$("${SCRIPT_DIR}/vault-addr.sh" "${root}")"
    VAULT_TOKEN="$(<"${token_file}")"
    export VAULT_ADDR VAULT_TOKEN
    export VAULT_CACERT="${SECRETS_DIR}/tls/ca.crt"
  fi
  ;;
esac

if [[ ! -d "${dir}/.terraform" || "${action}" == "init" ]]; then
  terraform -chdir="${dir}" init -input=false >/dev/null
fi

case "${action}" in
init) ;;
plan) terraform -chdir="${dir}" plan -input=false "$@" ;;
apply)
  terraform -chdir="${dir}" apply -input=false -auto-approve "$@"
  record last_apply success
  ;;
destroy) terraform -chdir="${dir}" destroy -input=false "$@" ;;
output) terraform -chdir="${dir}" output "$@" ;;
test) terraform -chdir="${dir}" test "$@" ;;
drift)
  set +e
  terraform -chdir="${dir}" plan -input=false -detailed-exitcode -lock=false "$@"
  rc=$?
  set -e
  case "${rc}" in
  0)
    record last_plan clean
    info "terraform/${root}: no drift"
    ;;
  2)
    record last_plan drift
    printf "\033[33mDRIFT:\033[0m terraform/%s — the plan is not empty\n" "${root}" >&2
    exit 2
    ;;
  *)
    record last_plan error
    die "terraform/${root}: plan failed (rc=${rc})"
    ;;
  esac
  ;;
*) die "Unknown action: ${action}" ;;
esac
