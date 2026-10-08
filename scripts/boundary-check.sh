#!/usr/bin/env bash
# Prove the Terraform/Ansible boundary that Vault enforces: each bootstrap
# token is asked (sys/capabilities-self) what it may do on paths it must and
# must not touch. Never prints a token.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_cmd curl
require_cmd jq
require_cmd terraform

CA="${SECRETS_DIR}/tls/ca.crt"
seal_addr="$(terraform -chdir="${TF_DIR}/infra" output -raw seal_vault_address)"
cluster_addr=""
if [[ -s "${SECRETS_DIR}/tokens/tf-platform" ]]; then
  cluster_addr="$("${SCRIPT_DIR}/vault-addr.sh" platform)"
fi

# token-file | vault | path | expectation (allow = must hold the capability,
# deny = must not hold it)
checks=(
  "tf-seal|seal|sys/mounts/transit|allow:create"
  "tf-seal|seal|auth/approle/role/gt-seal-autounseal|allow:update"
  "tf-seal|seal|auth/approle/role/gt-seal-autounseal/secret-id|deny:update"
  "tf-seal|seal|sys/policies/acl/gt-tf-seal|deny:update"
  "ansible-seal|seal|auth/approle/role/gt-seal-autounseal/secret-id|allow:update"
  "ansible-seal|seal|sys/policies/acl/autounseal|deny:update"
  "ansible-seal|seal|sys/mounts/transit|deny:create"
  "ansible-seal|seal|auth/approle/role/gt-seal-autounseal|deny:update"
  "tf-platform|cluster|sys/mounts/secret|allow:create"
  "tf-platform|cluster|sys/policies/acl/gt-admin|allow:update"
  "tf-platform|cluster|sys/auth/ldap|deny:update"
  "tf-platform|cluster|identity/group|deny:update"
  "tf-platform|cluster|secret/data/golden-ticket/identity|deny:read"
  "tf-platform|cluster|sys/policies/acl/gt-ansible-platform|deny:update"
  "ansible-platform|cluster|sys/auth/ldap|allow:update"
  "ansible-platform|cluster|identity/group|allow:update"
  "ansible-platform|cluster|secret/data/golden-ticket/identity|allow:update"
  "ansible-platform|cluster|sys/mounts/engineering|deny:create"
  "ansible-platform|cluster|sys/policies/acl/gt-admin|deny:update"
)

fails=0
checked=0
for check in "${checks[@]}"; do
  IFS='|' read -r file vault path expect <<<"${check}"
  token_file="${SECRETS_DIR}/tokens/${file}"
  [[ -s "${token_file}" ]] || continue
  addr="${seal_addr}"
  [[ "${vault}" == "cluster" ]] && addr="${cluster_addr}"
  [[ -n "${addr}" ]] || continue
  caps="$(curl -fsS --cacert "${CA}" -H "X-Vault-Token: $(<"${token_file}")" \
    -X POST -d "{\"paths\":[\"${path}\"]}" "${addr}/v1/sys/capabilities-self" |
    jq -r --arg p "${path}" '.[$p] // .capabilities // [] | join(",")')"
  mode="${expect%%:*}"
  cap="${expect#*:}"
  has=no
  [[ ",${caps}," == *",${cap},"* || ",${caps}," == *",root,"* ]] && has=yes
  if [[ "${mode}" == "allow" && "${has}" == yes ]] || [[ "${mode}" == "deny" && "${has}" == no ]]; then
    printf '  \033[32mok\033[0m   %-17s %-5s %-6s %s\n' "${file}" "${mode}" "${cap}" "${path}"
  else
    printf '  \033[31mFAIL\033[0m %-17s %-5s %-6s %s (has: %s)\n' "${file}" "${mode}" "${cap}" "${path}" "${caps:-none}"
    fails=$((fails + 1))
  fi
  checked=$((checked + 1))
done
[[ ${fails} -eq 0 ]] || die "${fails} boundary check(s) failed."
info "Token boundary holds (${checked} checks)"
