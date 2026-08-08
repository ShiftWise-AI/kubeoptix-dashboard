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

printf 'Instalando %s no namespace %s...\n' "${RELEASE_NAME}" "${NAMESPACE}"
helm upgrade --install "${RELEASE_NAME}" "${CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  --create-namespace \
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

printf 'Criando os demais recursos...\n'
helm upgrade "${RELEASE_NAME}" "${CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  --set buildOnly=false

printf 'Instalacao concluida.\n'