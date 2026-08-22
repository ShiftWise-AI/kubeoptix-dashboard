#!/usr/bin/env bash

set -Eeuo pipefail

readonly NAMESPACE="${1:-shiftwise-ai}"
readonly RELEASE_NAME="${2:-kubeoptix-dashboard}"
readonly SECRET_PREFIX="secret/sh.helm.release.v1.${RELEASE_NAME}"

command -v oc >/dev/null 2>&1 || {
  printf 'Erro: oc nao encontrado.\n' >&2
  exit 1
}

printf 'Removendo secrets Helm com prefixo %s* no namespace %s...\n' "${SECRET_PREFIX}" "${NAMESPACE}"

SECRETS_TO_DELETE="$(oc get secrets -n "${NAMESPACE}" -o name | grep "^${SECRET_PREFIX}" || true)"

if [[ -n "${SECRETS_TO_DELETE}" ]]; then
  xargs -r oc delete -n "${NAMESPACE}" <<<"${SECRETS_TO_DELETE}"
fi

if oc get secrets -n "${NAMESPACE}" -o name | grep -q "^${SECRET_PREFIX}"; then
  printf 'Erro: ainda existem secrets Helm com prefixo %s*\n' "${SECRET_PREFIX}" >&2
  exit 1
fi

printf 'Secrets Helm removidos com sucesso.\n'
