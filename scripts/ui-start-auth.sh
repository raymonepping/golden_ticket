#!/usr/bin/env bash
# Run the host console (127.0.0.1:3310, full Multipass control) with Keycloak
# sign-in and role gating. The UI's client secret and session key are read
# from Vault KV into ignored 0600 files under .secrets/ux — never env values.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd curl
require_cmd jq
require_cmd terraform

# Node addresses from Terraform's contract; secrets with Ansible's own token.
proxy="$(terraform -chdir="${TF_DIR}/infra" output -raw proxy_address)"
[[ -s "${BUILD_DIR}/deployed/identity.json" ]] || die "Identity is not deployed yet (make identity); use make ui-start."
umask 077
mkdir -p "${SECRETS_DIR}/ux"
addr="$("${SCRIPT_DIR}/vault-addr.sh" platform)"
secrets="$(curl -fsS --cacert "${SECRETS_DIR}/tls/ca.crt" -H "X-Vault-Token: $(<"${SECRETS_DIR}/tokens/ansible-platform")" \
  "${addr}/v1/secret/data/golden-ticket/identity")"
jq -er '.data.data.ui_client_secret' <<<"${secrets}" >"${SECRETS_DIR}/ux/oidc-client-secret"
jq -er '.data.data.ui_session_password' <<<"${secrets}" >"${SECRETS_DIR}/ux/session-secret"
unset secrets

cd "${ROOT_DIR}/ux"
export PORT=3310 GT_REPOSITORY_ROOT=..
export GT_ALLOWED_ORIGINS="http://127.0.0.1:3310"
# Keycloak's issuer is the front door (from day one).
export GT_OIDC_ISSUER="https://${proxy}:8443/realms/golden-ticket"
export GT_OIDC_CLIENT_SECRET_FILE="${SECRETS_DIR}/ux/oidc-client-secret"
export GT_SESSION_SECRET_FILE="${SECRETS_DIR}/ux/session-secret"
export GT_ENGINES_TOKEN_FILE="${SECRETS_DIR}/ux/engines-token"
export GT_ENGINES_NAMESPACE=engines
export GT_VAULT_ADDR="https://${proxy}:8202"
export NODE_EXTRA_CA_CERTS="${SECRETS_DIR}/tls/ca.crt"
exec node scripts/start.mjs
