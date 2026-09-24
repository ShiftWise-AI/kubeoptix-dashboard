#!/usr/bin/env bash

set -Eeuo pipefail

readonly RELEASE_NAME="kubeoptix-dashboard"
readonly NAMESPACE="shiftwise-ai"
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly CHART_DIR="${SCRIPT_DIR}/helm/kubeoptix-dashboard"

# Exported (not reassigned via a command prefix) since bash rejects VAR=value
# prefixes on readonly variables even when only the child's env is affected.
export RELEASE_NAME NAMESPACE

command -v helm >/dev/null 2>&1 || {
  printf 'Erro: Helm nao encontrado.\n' >&2
  exit 1
}
command -v oc >/dev/null 2>&1 || {
  printf 'Erro: oc nao encontrado.\n' >&2
  exit 1
}

trap 'printf "Erro: instalacao interrompida; os recursos ativos foram preservados.\n" >&2' ERR

printf 'Preparando recursos de build de %s no namespace %s...\n' "${RELEASE_NAME}" "${NAMESPACE}"
oc get namespace "${NAMESPACE}" >/dev/null 2>&1 || oc create namespace "${NAMESPACE}" >/dev/null
helm template "${RELEASE_NAME}" "${CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  --set-file environmentFile="${SCRIPT_DIR}/.env.openshift" \
  --set buildOnly=true \
  | oc apply --namespace "${NAMESPACE}" -f -

printf 'Iniciando o build da imagem...\n'
oc start-build "buildconfig/${RELEASE_NAME}" \
  --namespace "${NAMESPACE}" \
  --from-dir "${SCRIPT_DIR}" \
  --follow \
  --wait

printf 'Confirmando o push da imagem no ImageStream...\n'
BUILD_VERSION="$(oc get "buildconfig/${RELEASE_NAME}" \
  --namespace "${NAMESPACE}" \
  -o jsonpath='{.status.lastVersion}')"
BUILD_NAME="${RELEASE_NAME}-${BUILD_VERSION}"
IMAGE_TAG="$(oc get "buildconfig/${RELEASE_NAME}" \
  --namespace "${NAMESPACE}" \
  -o jsonpath='{.spec.output.to.name}')"
BUILD_DIGEST="$(oc get "build/${BUILD_NAME}" \
  --namespace "${NAMESPACE}" \
  -o jsonpath='{.status.output.to.imageDigest}')"
IMAGE_DIGEST="$(oc get "imagestreamtag/${IMAGE_TAG}" \
  --namespace "${NAMESPACE}" \
  -o jsonpath='{.image.metadata.name}')"
IMAGE_REFERENCE="$(oc get "imagestreamtag/${IMAGE_TAG}" \
  --namespace "${NAMESPACE}" \
  -o jsonpath='{.image.dockerImageReference}')"

if [[ -z "${BUILD_DIGEST}" || "${BUILD_DIGEST}" != "${IMAGE_DIGEST}" ]]; then
  printf 'Erro: digest do build (%s) difere do ImageStreamTag (%s).\n' "${BUILD_DIGEST:-ausente}" "${IMAGE_DIGEST:-ausente}" >&2
  exit 1
fi

printf 'Instalando recursos com a imagem imutavel %s...\n' "${IMAGE_REFERENCE}"
helm upgrade --install "${RELEASE_NAME}" "${CHART_DIR}" \
  --namespace "${NAMESPACE}" \
  --create-namespace \
  --rollback-on-failure \
  --wait \
  --timeout 5m \
  --set-file environmentFile="${SCRIPT_DIR}/.env.openshift" \
  --set-string dashboard.image="${IMAGE_REFERENCE}" \
  --set buildOnly=false

printf 'Validando o rollout e o digest em execucao...\n'
oc rollout status "statefulset/${RELEASE_NAME}" --namespace "${NAMESPACE}" --timeout=5m
RUNNING_IMAGE_IDS="$(oc get pods \
  --namespace "${NAMESPACE}" \
  --selector "app.kubernetes.io/name=${RELEASE_NAME}" \
  -o jsonpath='{range .items[*]}{range .status.containerStatuses[?(@.name=="dashboard")]}{.imageID}{"\n"}{end}{end}')"

if ! grep -qF "${IMAGE_DIGEST}" <<<"${RUNNING_IMAGE_IDS}"; then
  printf 'Erro: o pod nao esta executando o digest esperado %s. Imagens: %s\n' "${IMAGE_DIGEST}" "${RUNNING_IMAGE_IDS:-ausentes}" >&2
  exit 1
fi

printf 'Executando limpeza pos-instalacao...\n'
"${SCRIPT_DIR}/cleanup.sh"
trap - ERR

printf 'Instalacao concluida com o digest %s.\n' "${IMAGE_DIGEST}"