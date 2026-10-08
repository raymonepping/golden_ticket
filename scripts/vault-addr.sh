#!/usr/bin/env bash
# Print the Vault API address for a Terraform root:
#   seal     → the seal Vault (from infra outputs)
#   platform → the cluster's ACTIVE node, resolved through unauthenticated
#              sys/leader on each cluster node (never pinned to gt-vault-1)
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd terraform
require_cmd jq
require_cmd curl

case "${1:-}" in
seal)
  terraform -chdir="${TF_DIR}/infra" output -raw seal_vault_address
  ;;
platform)
  while read -r addr; do
    leader="$(curl -fsS --max-time 3 --cacert "${SECRETS_DIR}/tls/ca.crt" "${addr}/v1/sys/leader" 2>/dev/null |
      jq -r 'select(.ha_enabled) | .leader_address // empty')" || continue
    if [[ -n "${leader}" ]]; then
      printf '%s\n' "${leader}"
      exit 0
    fi
  done < <(terraform -chdir="${TF_DIR}/infra" output -json vault_api_addresses | jq -r '.[]')
  die "No cluster node reports an active leader."
  ;;
*) die "usage: vault-addr.sh <seal|platform>" ;;
esac
