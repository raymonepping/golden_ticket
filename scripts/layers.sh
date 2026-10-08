#!/usr/bin/env bash
# Write .build/layers.json: one row per phase (phases.txt order) with its
# tool and evidence, plus the gates. Non-secret: counts, times, results.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
# shellcheck source=phases.sh
source "${SCRIPT_DIR}/phases.sh"
require_cmd jq
require_cmd terraform

json_or_null() { if [[ -s "$1" ]]; then cat "$1"; else echo null; fi; }

rows="[]"
while read -r tool name; do
  if [[ "${tool}" == tf ]]; then
    count="$(terraform -chdir="${TF_DIR}/${name}" state list 2>/dev/null | grep -cv '^data\.' || true)"
    ev="$(json_or_null "${BUILD_DIR}/terraform/${name}.json")"
    rows="$(jq --arg n "${name}" --argjson c "${count:-0}" --argjson ev "${ev}" \
      '. + [{phase: $n, tool: "terraform", resources: $c,
             last_apply: ($ev.last_apply // null), last_plan: ($ev.last_plan // null)}]' <<<"${rows}")"
  else
    run="$(json_or_null "${BUILD_DIR}/ansible-stats/${name}.json")"
    chk="$(json_or_null "${BUILD_DIR}/ansible-stats/${name}.check.json")"
    rows="$(jq --arg n "${name}" --argjson run "${run}" --argjson chk "${chk}" \
      '. + [{phase: $n, tool: "ansible",
             last_run: (if $run then {at: $run.finished_at, changed: $run.changed_total, failed: $run.failed_total} else null end),
             last_check: (if $chk then {at: $chk.finished_at, changed: $chk.changed_total} else null end)}]' <<<"${rows}")"
  fi
done < <(phases)

gates="{}"
for gate in idempotency drift secret-scan validation; do
  gates="$(jq --arg g "${gate}" --argjson v "$(json_or_null "${BUILD_DIR}/gates/${gate}.json")" '.[$g] = $v' <<<"${gates}")"
done

umask 022
jq -n --argjson rows "${rows}" --argjson gates "${gates}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{generated_at: $at, phases: $rows, gates: $gates}' >"${BUILD_DIR}/layers.json.tmp"
mv "${BUILD_DIR}/layers.json.tmp" "${BUILD_DIR}/layers.json"
info "Wrote .build/layers.json"
