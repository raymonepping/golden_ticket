#!/usr/bin/env bash
# Print one lab person's password from Vault KV. Lab only; an explicit operator
# action — nothing else in the automation ever prints a secret.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd curl
require_cmd jq

user="${1:-}"
[[ "${user}" =~ ^[a-z][a-z0-9-]{0,31}$ ]] || die "Usage: make identity-show-user PERSON=<uid>"
token_file="${SECRETS_DIR}/tokens/ansible-platform"
[[ -s "${token_file}" ]] || die "Ansible's cluster token is missing; run make bootstrap."
addr="$("${SCRIPT_DIR}/vault-addr.sh" platform)"
curl -fsS --cacert "${SECRETS_DIR}/tls/ca.crt" \
  -H "X-Vault-Token: $(<"${token_file}")" \
  "${addr}/v1/secret/data/golden-ticket/identity" |
  jq -er --arg k "user_${user}" '.data.data[$k] // error("no such user")'
