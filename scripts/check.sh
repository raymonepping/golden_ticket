#!/usr/bin/env bash
# Static checks: tools, shell, Terraform (fmt/validate/test), Ansible syntax +
# lint, and secret/generated paths that would be committed.
set -euo pipefail
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ansible-env.sh
source "${SCRIPT_DIR}/ansible-env.sh"

for cmd in multipass terraform ansible-playbook ansible-galaxy ansible-lint shellcheck ssh-keygen ssh-keyscan curl jq openssl vault shasum; do
  require_cmd "${cmd}"
done
info "Controller tools present"

for script in "${ROOT_DIR}"/scripts/*.sh; do
  bash -n "${script}"
done
shellcheck -x --source-path="${ROOT_DIR}/scripts" "${ROOT_DIR}"/scripts/*.sh
info "Shell scripts: bash -n + ShellCheck clean"

terraform fmt -check -recursive "${TF_DIR}" >/dev/null || die "terraform fmt: run 'terraform fmt -recursive terraform'"
for root in "${TF_DIR}"/*/; do
  root="$(basename "${root}")"
  [[ -d "${TF_DIR}/${root}/.terraform" ]] || terraform -chdir="${TF_DIR}/${root}" init -input=false -backend=false >/dev/null
  terraform -chdir="${TF_DIR}/${root}" validate -no-color >/dev/null || die "terraform validate failed in ${root}"
  if compgen -G "${TF_DIR}/${root}/tests/*.tftest.hcl" >/dev/null; then
    terraform -chdir="${TF_DIR}/${root}" test -no-color >/dev/null || die "terraform test failed in ${root}"
  fi
done
info "Terraform: fmt, validate, test clean"

for playbook in "${ROOT_DIR}"/ansible/*.yml; do
  [[ "$(basename "${playbook}")" == "requirements.yml" ]] && continue
  ansible-playbook --syntax-check "${playbook}" </dev/null >/dev/null
done
info "Playbook syntax valid"

(cd "${ROOT_DIR}" && ansible-lint --profile production -q ansible </dev/null) || die "ansible-lint (production profile) failed"
info "ansible-lint clean (production profile)"

if git -C "${ROOT_DIR}" ls-files --cached --others --exclude-standard |
  grep -E '(^|/)(\.env$|\.secrets/|\.build/|\.cache/)|\.(key|hclic|pem|tfstate|tfplan)$|tfstate\.backup|vault-init\.json|seal-init\.json|(^|/)tokens/'; then
  die "Sensitive or generated paths would be committed (listed above)."
fi
info "No sensitive or generated paths tracked"
