#!/usr/bin/env bash

set -Eeuo pipefail

readonly RELEASE_NAME="${RELEASE_NAME:-kubeoptix-dashboard}"
readonly NAMESPACE="${NAMESPACE:-shiftwise-ai}"
readonly APP_SELECTOR="app.kubernetes.io/name=${RELEASE_NAME}"

command -v oc >/dev/null 2>&1 || {
  printf 'Erro: oc nao encontrado.\n' >&2
  exit 1
}

delete_finished_builds() {
  printf 'Removendo builds concluidos (%s-*)...\n' "${RELEASE_NAME}"
  local builds
  builds="$(oc get builds \
    --namespace "${NAMESPACE}" \
    -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.phase}{"\n"}{end}' \
    2>/dev/null | grep -E "^${RELEASE_NAME}-" || true)"

  if [[ -z "${builds}" ]]; then
    return 0
  fi

  while read -r name phase; do
    [[ -n "${name}" ]] || continue
    case "${phase}" in
      Complete | Failed | Cancelled | Error)
        oc delete "build/${name}" --namespace "${NAMESPACE}" --ignore-not-found >/dev/null
        printf '  build/%s (%s) removido\n' "${name}" "${phase}"
        ;;
      *)
        printf '  build/%s (%s) mantido\n' "${name}" "${phase}"
        ;;
    esac
  done <<<"${builds}"
}

delete_orphan_pods() {
  printf 'Removendo pods orfaos...\n'
  local pods
  pods="$(oc get pods \
    --namespace "${NAMESPACE}" \
    --field-selector 'status.phase!=Running,status.phase!=Pending' \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
    2>/dev/null | grep -E "^${RELEASE_NAME}(-|$)" || true)"

  if [[ -z "${pods}" ]]; then
    return 0
  fi

  while read -r name; do
    [[ -n "${name}" ]] || continue
    oc delete "pod/${name}" --namespace "${NAMESPACE}" --ignore-not-found >/dev/null
    printf '  pod/%s removido\n' "${name}"
  done <<<"${pods}"
}

delete_orphan_configmaps() {
  printf 'Removendo configmaps orfaos (%s-*)...\n' "${RELEASE_NAME}"
  local in_use configmaps name
  # ConfigMaps referenced by any workload/pod in the namespace must be preserved.
  in_use="$(oc get pods,statefulsets,deployments,daemonsets,jobs,cronjobs \
    --namespace "${NAMESPACE}" \
    -o jsonpath='{range .items[*]}{range .spec.template.spec.volumes[*]}{.configMap.name}{"\n"}{end}{range .spec.template.spec.containers[*]}{range .envFrom[*]}{.configMapRef.name}{"\n"}{end}{range .env[*]}{.valueFrom.configMapKeyRef.name}{"\n"}{end}{end}{range .spec.volumes[*]}{.configMap.name}{"\n"}{end}{range .spec.containers[*]}{range .envFrom[*]}{.configMapRef.name}{"\n"}{end}{range .env[*]}{.valueFrom.configMapKeyRef.name}{"\n"}{end}{end}{end}' \
    2>/dev/null | sort -u || true)"

  configmaps="$(oc get configmaps \
    --namespace "${NAMESPACE}" \
    -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' \
    2>/dev/null | grep -E "^${RELEASE_NAME}-" || true)"

  if [[ -z "${configmaps}" ]]; then
    return 0
  fi

  while read -r name; do
    [[ -n "${name}" ]] || continue
    if grep -qxF "${name}" <<<"${in_use}"; then
      printf '  configmap/%s mantido (em uso)\n' "${name}"
      continue
    fi
    oc delete "configmap/${name}" --namespace "${NAMESPACE}" --ignore-not-found >/dev/null
    printf '  configmap/%s removido\n' "${name}"
  done <<<"${configmaps}"
}

delete_orphan_resources() {
  printf 'Removendo objetos orfaos do release...\n'
  local live_manifest resources kind name
  live_manifest="$(helm get manifest "${RELEASE_NAME}" --namespace "${NAMESPACE}" 2>/dev/null || true)"

  if [[ -z "${live_manifest}" ]]; then
    return 0
  fi

  resources="$(oc get secret,service,route,statefulset,deployment \
    --namespace "${NAMESPACE}" \
    --selector "${APP_SELECTOR}" \
    -o jsonpath='{range .items[*]}{.kind}{" "}{.metadata.name}{"\n"}{end}' \
    2>/dev/null || true)"

  if [[ -z "${resources}" ]]; then
    return 0
  fi

  while read -r kind name; do
    [[ -n "${name}" ]] || continue
    # Objects carrying the app label but absent from the rendered manifest are leftovers.
    if grep -qi "kind: ${kind}" <<<"${live_manifest}" && grep -qE "name: ${name}$" <<<"${live_manifest}"; then
      continue
    fi
    oc delete "${kind}/${name}" --namespace "${NAMESPACE}" --ignore-not-found >/dev/null
    printf '  %s/%s removido\n' "${kind}" "${name}"
  done <<<"${resources}"
}

printf 'Iniciando limpeza do release %s no namespace %s...\n' "${RELEASE_NAME}" "${NAMESPACE}"
delete_finished_builds || true
delete_orphan_pods || true
delete_orphan_configmaps || true
delete_orphan_resources || true
printf 'Limpeza concluida.\n'
