#!/usr/bin/env bash
# Unauthenticated `vault status` for each Vault node over verified TLS.
# Node names and addresses come from the Terraform contract (lab_nodes).
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd vault
require_cmd jq
require_cmd terraform

export VAULT_CACERT="${SECRETS_DIR}/tls/ca.crt"
terraform -chdir="${TF_DIR}/infra" output -json lab_nodes |
  jq -r 'to_entries[] | select(.value.vault_role != "none") | "\(.key) \(.value.vault_role) \(.value.ipv4)"' |
  sort | while read -r name role ip; do
  printf '\n\033[1m%s\033[0m (%s, %s)\n' "${name}" "${role}" "${ip}"
  if ! out="$(VAULT_ADDR="https://${ip}:8200" vault status -format=json 2>/dev/null)" && [[ -z "${out}" ]]; then
    echo "  not answering (cluster nodes start after 'make agent')"
    continue
  fi
  jq -r '"  type=\(.type) initialized=\(.initialized) sealed=\(.sealed) ha=\(.ha_enabled) mode=\(if .is_self then "active" elif .ha_enabled then "standby" else "-" end) version=\(.version)"' <<<"${out}"
done
