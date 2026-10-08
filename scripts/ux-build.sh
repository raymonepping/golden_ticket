#!/usr/bin/env bash
# Build the UI once per source state and package the Nitro bundle as
# .build/ux/gt-ux-<source-sha>.tar.gz (+ .sha256). Prints the bundle path.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd npm
require_cmd shasum

UX_DIR="${ROOT_DIR}/ux"
OUT_DIR="${BUILD_DIR}/ux"
mkdir -p "${OUT_DIR}"

# Source digest: every tracked-shape source file, not build output.
source_sha="$(cd "${UX_DIR}" && find app server shared scripts nuxt.config.ts package.json package-lock.json -type f ! -name '.DS_Store' -print0 |
  LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -c1-16)"
bundle="${OUT_DIR}/gt-ux-${source_sha}.tar.gz"

if [[ ! -f "${bundle}" ]]; then
  info "Building the UI bundle ${source_sha}"
  (cd "${UX_DIR}" && npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null)
  # macOS xattrs/AppleDouble files must never reach the guest.
  COPYFILE_DISABLE=1 tar -C "${UX_DIR}/.output" -czf "${bundle}.tmp" --exclude '._*' .
  mv "${bundle}.tmp" "${bundle}"
  shasum -a 256 "${bundle}" | cut -d' ' -f1 >"${bundle}.sha256"
  # Keep the two most recent bundles.
  find "${OUT_DIR}" -name 'gt-ux-*.tar.gz' -print0 | xargs -0 ls -t | tail -n +3 | while read -r old; do rm -f "${old}" "${old}.sha256"; done
fi
printf '%s\n' "${bundle}"
