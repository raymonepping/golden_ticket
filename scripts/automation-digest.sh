#!/usr/bin/env bash
# Print the SHA-256 automation digest: every file that defines the lab —
# ansible/, the Terraform roots (*.tf, *.tftpl, *.tfvars.json; not tests,
# state or .terraform), policies/, ansible.cfg and the phase list — hashed
# per file, then over the sorted "<sha256>  <path>" list. The console runs
# this same script to decide whether the last convergence is current.
set -euo pipefail
ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

{
  find ansible policies -type f ! -name '.DS_Store' ! -name '._*' ! -path '*/__pycache__/*' -print0
  find terraform -type f \( -name '*.tf' -o -name '*.tftpl' -o -name '*.tfvars.json' \) \
    ! -path '*/.terraform/*' ! -path '*/tests/*' -print0
  printf '%s\0' ansible.cfg scripts/phases.txt
} | LC_ALL=C sort -z |
  while IFS= read -r -d '' file; do
    printf '%s  %s\n' "$(shasum -a 256 <"${file}" | cut -d' ' -f1)" "${file}"
  done |
  shasum -a 256 | cut -d' ' -f1
