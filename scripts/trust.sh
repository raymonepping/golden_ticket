#!/usr/bin/env bash
# scripts/trust.sh — make the Mac (Chrome, Safari, curl via the keychain)
# trust the golden_ticket lab CA, so the front door, Vault, Keycloak and the
# console load without certificate warnings. Pattern: red_doors.
#
#   trust.sh trust     add .secrets/tls/ca.crt to the System keychain as a trusted root (sudo)
#   trust.sh untrust   remove it again (sudo)
#   trust.sh status    is the CA trusted, and does macOS accept the front door's certificate?
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd security
require_cmd openssl

KEYCHAIN=/Library/Keychains/System.keychain
CA="${SECRETS_DIR}/tls/ca.crt"
[[ -s "${CA}" ]] || die "${CA} missing — run make lab first."
openssl x509 -in "${CA}" -noout -ext basicConstraints 2>/dev/null | grep -q 'CA:TRUE' ||
  die "${CA} is not a CA certificate."

subject() { openssl x509 -in "$1" -noout -subject | sed 's/^subject= *//'; }
sha1() { openssl x509 -in "$1" -noout -fingerprint -sha1 | cut -d= -f2 | tr -d :; }
present() { security find-certificate -a -Z "${KEYCHAIN}" 2>/dev/null | grep -qi "SHA-1 hash: $(sha1 "$1")"; }
cn() { openssl x509 -in "$1" -noout -subject -nameopt multiline | sed -n 's/^ *commonName *= *//p'; }
# Trusted = in the System keychain AND listed in the admin trust settings.
# (`security verify-cert -c <ca>` is useless here: a self-signed root always
# "verifies" against itself, trusted or not.)
trusted() {
  present "$1" || return 1
  security dump-trust-settings -d 2>/dev/null | grep -qF "$(cn "$1")"
}

# The front door's address, from the ownership manifest (if the proxy exists).
front_door() { terraform -chdir="${TF_DIR}/infra" output -raw proxy_address 2>/dev/null || true; }

check_front_door() {
  local ip leaf
  ip="$(front_door)"
  [[ -n "${ip}" ]] || return 0
  leaf="${SECRETS_DIR}/tls/gt-proxy-1.crt"
  [[ -s "${leaf}" ]] || return 0
  # SSL policy with the IP as hostname: what Chrome effectively checks.
  if security verify-cert -c "${leaf}" -p ssl -s "${ip}" -q >/dev/null 2>&1; then
    info "front door https://${ip} — certificate accepted by macOS"
  else
    printf '\033[33m!!\033[0m front door https://%s — certificate NOT accepted (make trust)\n' "${ip}" >&2
  fi
}

case "${1:-status}" in
trust)
  if trusted "${CA}"; then
    info "already trusted: $(subject "${CA}")"
  else
    info "trusting $(subject "${CA}") in the System keychain (asks for your password)"
    sudo security add-trusted-cert -d -r trustRoot -k "${KEYCHAIN}" "${CA}"
    info "trusted: $(subject "${CA}")"
  fi
  check_front_door
  info "Quit and reopen Chrome (Cmd+Q) so it picks up the new trust."
  ;;
untrust)
  if present "${CA}"; then
    sudo security delete-certificate -Z "$(sha1 "${CA}")" "${KEYCHAIN}" >/dev/null
    info "removed: $(subject "${CA}")"
  else
    info "not in the keychain: $(subject "${CA}")"
  fi
  ;;
status)
  if trusted "${CA}"; then
    info "trusted: $(subject "${CA}")"
  elif present "${CA}"; then
    printf '\033[33m!!\033[0m in keychain but NOT trusted: %s — make trust\n' "$(subject "${CA}")" >&2
  else printf '\033[33m!!\033[0m not trusted: %s — make trust\n' "$(subject "${CA}")" >&2; fi
  check_front_door
  ;;
*) die "usage: trust.sh trust|untrust|status" ;;
esac
