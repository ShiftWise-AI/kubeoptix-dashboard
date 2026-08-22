#!/usr/bin/env bash

set -Eeuo pipefail

readonly RELEASE_NAME="kubeoptix-dashboard"
readonly NAMESPACE="shiftwise-ai"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly CHART_DIR="${SCRIPT_DIR}/helm/kubeoptix-dashboard"

command -v helm >/dev/null 2>&1 || {
  printf 'Erro: Helm nao encontrado.\n' >&2
  exit 1
}

# Cleanup must run even if an earlier step aborts the script.
trap 'printf "Executando limpeza pos-instalacao...\n"; RELEASE_NAME="${RELEASE_NAME}" NAMESPACE="${NAMESPACE}" "${SCRIPT_DIR}/cleanup.sh" || true; bash "${SCRIPT_DIR}/purge-helm-secrets.sh" "${NAMESPACE}" "${RELEASE_NAME}" || true' EXIT

printf 'Instalando %s no namespace %s...\n' "${RELEASE_NAME}" "${NAMESPACE}"
helm upgrade --install "${RELEASE_NAME}" "${CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  --create-namespace \
  --set-file environmentFile="${SCRIPT_DIR}/.env.openshift" \
  --set buildOnly=true

printf 'Iniciando o build da imagem...\n'
oc start-build "buildconfig/${RELEASE_NAME}" \
  --namespace "${NAMESPACE}" \
  --from-dir "${SCRIPT_DIR}" \
  --follow \
  --wait

printf 'Confirmando o push da imagem no ImageStream...\n'
oc get "imagestreamtag/${RELEASE_NAME}:latest" \
  --namespace "${NAMESPACE}" \
  >/dev/null

printf 'Removendo o build concluido...\n'
BUILD_VERSION="$(oc get "buildconfig/${RELEASE_NAME}" \
  --namespace "${NAMESPACE}" \
  -o jsonpath='{.status.lastVersion}')"
oc delete "build/${RELEASE_NAME}-${BUILD_VERSION}" \
  --namespace "${NAMESPACE}" \
  --ignore-not-found \
  --wait=false >/dev/null

printf 'Criando os demais recursos...\n'
helm upgrade "${RELEASE_NAME}" "${CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  --set-file environmentFile="${SCRIPT_DIR}/.env.openshift" \
  --set buildOnly=false

printf 'Executando limpeza pos-instalacao...\n'
RELEASE_NAME="${RELEASE_NAME}" NAMESPACE="${NAMESPACE}" "${SCRIPT_DIR}/cleanup.sh"
bash "${SCRIPT_DIR}/purge-helm-secrets.sh" "${NAMESPACE}" "${RELEASE_NAME}"
trap - EXIT

printf 'Instalacao concluida.\n'