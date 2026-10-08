#!/usr/bin/env bash
# Look for secret material in Terraform state, .build/ and any given paths.
# Two checks: every KNOWN value (inputs, tokens, init material) and secret-
# shaped PATTERNS. Prints only file names and labels — never a value.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ansible-env.sh
source "${SCRIPT_DIR}/ansible-env.sh"

declare -A values=()
[[ -n "${VAULT_LICENSE:-}" ]] && values[license]="${VAULT_LICENSE:0:64}"
[[ -n "${RHSM_ORG:-}" ]] && values[rhsm_org]="${RHSM_ORG}"
[[ -n "${RHSM_ACTIVATION_KEY:-}" ]] && values[rhsm_key]="${RHSM_ACTIVATION_KEY}"
if [[ -f "${SECRETS_DIR}/ansible/id_ed25519" ]]; then
  values[ssh_private_key]="$(sed -n '2p' "${SECRETS_DIR}/ansible/id_ed25519")"
fi
while IFS= read -r f; do
  values["token:${f#"${SECRETS_DIR}"/}"]="$(tr -d '\n' <"${f}")"
done < <(find "${SECRETS_DIR}/tokens" "${SECRETS_DIR}/ux" -type f 2>/dev/null)
for f in seal-init vault-init; do
  json="${SECRETS_DIR}/${f}.json"
  [[ -f "${json}" ]] || continue
  values["${f}-root"]="$(jq -r '.root_token' "${json}")"
  i=0
  while IFS= read -r key; do
    values["${f}-key${i}"]="${key}"
    i=$((i + 1))
  done < <(jq -r '(.keys_base64 // []) + (.keys // []) + (.recovery_keys_base64 // []) + (.recovery_keys // []) | .[]' "${json}")
done
# The seal agent's live secret-ids (read over multipass exec, never printed).
if command -v multipass >/dev/null 2>&1; then
  for f in /var/lib/vault-agent/secret-id /etc/vault-agent/approle/rotator-secret-id; do
    v="$(multipass exec gt-agent-1 -- sudo cat "${f}" 2>/dev/null | tr -d '\n' || true)"
    [[ -n "${v}" ]] && values["agent:${f##*/}"]="${v}"
  done
fi
# Extra values (identity secrets) may be supplied by later phases
# as a 0600 file of label<TAB>value lines; it is read, never printed.
if [[ -f "${CACHE_DIR}/secret-scan.extra" ]]; then
  while IFS=$'\t' read -r label value; do
    [[ -n "${label}" ]] && values["${label}"]="${value}"
  done <"${CACHE_DIR}/secret-scan.extra"
fi

targets=("$@")
if [[ ${#targets[@]} -eq 0 ]]; then
  targets=("${BUILD_DIR}")
  while IFS= read -r f; do targets+=("${f}"); done < <(
    find "${TF_DIR}" "${SECRETS_DIR}/archive" -type f \( -name '*.tfstate' -o -name '*.tfstate.*' \) 2>/dev/null
  )
fi

hits=0
for label in "${!values[@]}"; do
  value="${values[$label]}"
  [[ ${#value} -ge 8 ]] || continue
  if files="$(grep -rlF -- "${value}" "${targets[@]}" 2>/dev/null)"; then
    printf 'LEAK: %s found in %s\n' "${label}" "${files//$'\n'/, }" >&2
    hits=$((hits + 1))
  fi
done
# Secret-shaped patterns: Vault service/batch/recovery tokens, PEM private
# keys, the licence header.
patterns=('hv[sbr]\.[A-Za-z0-9_-]{20,}' '-----BEGIN [A-Z ]*PRIVATE KEY-----' '02MV4UU43BK5')
for pattern in "${patterns[@]}"; do
  if files="$(grep -rlE -- "${pattern}" "${targets[@]}" 2>/dev/null)"; then
    printf 'LEAK: pattern %s found in %s\n' "${pattern%%[\\\[]*}…" "${files//$'\n'/, }" >&2
    hits=$((hits + 1))
  fi
done
[[ ${hits} -eq 0 ]] || die "${hits} secret finding(s)."
info "Secret scan clean: ${#values[@]} known values + ${#patterns[@]} patterns over ${#targets[@]} target(s)"
