#!/usr/bin/env bash
# make rotation-proof — rotate the seal agent's secret-id twice and prove the
# old one is dead, the current one works, and exactly one is valid. Runs the
# logins on gt-agent-1 itself (the AppRole is bound to its address). Prints
# HTTP codes only, never a secret. Changes state (two rotations).
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd multipass
require_cmd terraform
require_cmd jq

seal="$(terraform -chdir="${TF_DIR}/infra" output -raw seal_vault_address)"
proof="$(mktemp "${CACHE_DIR}/rotation-proof.XXXXXX")"
cat >"${proof}" <<PROOF
#!/usr/bin/env bash
set -euo pipefail
umask 077
V="${seal}"
CA=/etc/vault-agent/tls/ca.crt
ROLE_ID="\$(cat /etc/vault-agent/approle/role-id)"
OLD="\$(cat /var/lib/vault-agent/secret-id)"
login() { jq -n --arg r "\$ROLE_ID" --arg s "\$1" '{role_id:\$r,secret_id:\$s}' |
  curl -s -o /dev/null -w '%{http_code}' --cacert "\$CA" -X POST --data @- "\$V/v1/auth/approle/login"; }
echo "old secret-id login before rotation: \$(login "\$OLD")"
systemctl start seal-rotator.service
systemctl start seal-rotator.service
NEW="\$(cat /var/lib/vault-agent/secret-id)"
echo "old secret-id login after two rotations: \$(login "\$OLD")"
echo "current secret-id login: \$(login "\$NEW")"
PROOF
multipass transfer "${proof}" gt-agent-1:/tmp/gt-rotation-proof.sh
: >"${proof}"
multipass exec gt-agent-1 -- sudo bash /tmp/gt-rotation-proof.sh
multipass exec gt-agent-1 -- rm -f /tmp/gt-rotation-proof.sh
count="$(curl -fsS --cacert "${SECRETS_DIR}/tls/ca.crt" -H "X-Vault-Token: $(<"${SECRETS_DIR}/tokens/ansible-seal")" \
  -X LIST "${seal}/v1/auth/approle/role/gt-seal-autounseal/secret-id" | jq '.data.keys | length')"
echo "valid secret-ids for gt-seal-autounseal: ${count}"
[[ "${count}" == 1 ]] || die "Expected exactly one valid secret-id."
