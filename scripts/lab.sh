#!/usr/bin/env bash
# make lab — the complete, phased, fail-closed workflow:
#   every phase of scripts/phases.txt in order (Terraform builds the house,
#   Ansible decorates it), then the gates: idempotency (every Ansible phase
#   changed=0), Terraform drift (every plan empty), secret scan. Only then the
#   convergence stamp. On failure the exact resume target is printed.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
# shellcheck source=phases.sh
source "${SCRIPT_DIR}/phases.sh"
require_cmd jq

started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
digest="$("${SCRIPT_DIR}/automation-digest.sh")"
banner() { printf '\n\033[1;7m %s \033[0m %s\n\n' "$1" "$2" >&2; }
fail() {
  printf '\n\033[31m%s failed.\033[0m Fix the reported error, then resume with:\n  %s && make lab\n' "$1" "$2" >&2
  exit 1
}

mapfile -t PHASES < <(phases)
total=$((${#PHASES[@]} + 3))
make -s deps >/dev/null
make -s check

timings="{}"
n=0
for entry in "${PHASES[@]}"; do
  read -r tool name <<<"${entry}"
  n=$((n + 1))
  banner "${n}/${total}" "${tool} ${name}"
  t0=$(date +%s)
  case "${tool}" in
  tf) make "$([[ "${name}" == infra ]] && echo infra || echo "${name}")" || fail "${tool} ${name}" "make ${name}" ;;
  ansible) "${SCRIPT_DIR}/ansible-run.sh" "${name}" || fail "${tool} ${name}" "make ${name}" ;;
  esac
  timings="$(jq --arg p "${name}" --argjson s "$(($(date +%s) - t0))" '.[$p] = $s' <<<"${timings}")"
done

n=$((n + 1))
banner "${n}/${total}" "gate: idempotency (every Ansible phase again, changed=0)"
"${SCRIPT_DIR}/idempotency.sh" || fail "The idempotency gate" "make idempotency"
n=$((n + 1))
banner "${n}/${total}" "gate: Terraform drift (every plan empty)"
TF_ONLY=1 "${SCRIPT_DIR}/drift.sh" || fail "The drift gate" "make drift"
n=$((n + 1))
banner "${n}/${total}" "gate: secret scan"
"${SCRIPT_DIR}/secret-scan.sh" || fail "The secret scan" "make secret-scan"

umask 022
jq -n \
  --arg playbook "scripts/lab.sh" \
  --arg started "${started_at}" \
  --arg finished "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg digest "${digest}" \
  --argjson phases "$(printf '%s\n' "${PHASES[@]}" | jq -R 'split(" ") | {tool: .[0], phase: .[1]}' | jq -s .)" \
  --argjson timings "${timings}" \
  --argjson nodes "$(terraform -chdir="${TF_DIR}/infra" output -json lab_nodes | jq 'keys')" \
  '{result: "success", playbook: $playbook, phases: $phases, phase_seconds: $timings,
    started_at: $started, finished_at: $finished, automation_digest: $digest, nodes: $nodes}' \
  >"${BUILD_DIR}/convergence.json.tmp"
mv "${BUILD_DIR}/convergence.json.tmp" "${BUILD_DIR}/convergence.json"
"${SCRIPT_DIR}/layers.sh"
banner "done" "golden_ticket converged — digest ${digest:0:12}, evidence in .build/"
