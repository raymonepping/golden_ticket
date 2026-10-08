#!/usr/bin/env bash
# Shared helpers. Paths only — never credentials.

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="${ROOT_DIR}/.secrets"
CACHE_DIR="${ROOT_DIR}/.cache"
BUILD_DIR="${ROOT_DIR}/.build"
TF_DIR="${ROOT_DIR}/terraform"
export ROOT_DIR SECRETS_DIR CACHE_DIR BUILD_DIR TF_DIR

info() { printf '\033[1m==>\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[31mERROR:\033[0m %s\n' "$*" >&2
  exit 1
}
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

prepare_local_dirs() {
  umask 077
  mkdir -p "${SECRETS_DIR}" "${CACHE_DIR}/ansible/tmp" "${CACHE_DIR}/ansible/collections" \
    "${CACHE_DIR}/ansible/inventory" "${BUILD_DIR}"
  chmod 700 "${SECRETS_DIR}" "${CACHE_DIR}" "${BUILD_DIR}"
}
