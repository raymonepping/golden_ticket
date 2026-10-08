#!/usr/bin/env bash
# make down / make up — stop (never delete) or start the gt-* VMs in the
# documented order. Names and roles come from terraform/infra's topology file
# (nodes.auto.tfvars.json), never from a list in this script.
#
#   down.sh down   services → cluster → seal agent → seal Vault last
#   down.sh up     seal Vault → seal agent → cluster → services (then: make unseal)
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd multipass
require_cmd jq

NODES_FILE="${TF_DIR}/infra/nodes.auto.tfvars.json"
[[ -s ${NODES_FILE} ]] || die "Topology not found: ${NODES_FILE}"

# Names for one or more roles, sorted (gt-vault-1..3 in order).
names() {
  local roles
  roles="$(printf '%s\n' "$@" | jq -R . | jq -s .)"
  jq -r --argjson roles "${roles}" \
    '.nodes | to_entries[] | select(.value.role as $r | $roles | index($r)) | .key' \
    "${NODES_FILE}" | sort
}

# Services in this order: console, front door, identity.
mapfile -t services < <(names ux; names proxy; names identity)
mapfile -t cluster < <(names cluster)
mapfile -t agent < <(names agent)
mapfile -t seal < <(names seal)

known="$(multipass list --format json | jq -r '.list[].name')"

act() {
  local verb="$1" vm
  shift
  for vm in "$@"; do
    if ! grep -qx "${vm}" <<<"${known}"; then
      info "Skipping ${vm} (not in Multipass)"
      continue
    fi
    info "${verb^} ${vm}"
    multipass "${verb}" "${vm}"
  done
}

case "${1:-}" in
  down)
    reversed=()
    for ((i = ${#cluster[@]} - 1; i >= 0; i--)); do reversed+=("${cluster[i]}"); done
    act stop "${services[@]}" "${reversed[@]}" "${agent[@]}" "${seal[@]}"
    info "golden_ticket VMs stopped (nothing deleted). Start again with: make up"
    ;;
  up)
    act start "${seal[@]}" "${agent[@]}" "${cluster[@]}" "${services[@]}"
    info "golden_ticket VMs started. The seal Vault is sealed after a start: make unseal"
    ;;
  *)
    die "Usage: down.sh down|up"
    ;;
esac
