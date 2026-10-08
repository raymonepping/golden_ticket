#!/usr/bin/env bash
# Browser tests (sign-in, role gating, a11y) against a running console
# (URL as $1; optional spec files after it). Passwords are
# read from Vault for the duration of the run only and never written to disk.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
url="${1:?usage: ui-signin-test.sh <console-url>}"
for person in viewer barend raymon; do
  export "GT_PW_${person^^}=$("${SCRIPT_DIR}/identity-show-user.sh" "${person}")"
done
cd "${ROOT_DIR}/ux"
GT_UI_URL="${url}" npx playwright test "${@:2}"
