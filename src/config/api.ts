// Proxy prefixes only: real upstream URLs are resolved by the Vite dev proxy or by server.mjs.
export type ApiService = 'harvester' | 'analyzer' | 'core-ai' | 'settings'

export function getApiPath(service: ApiService, path: string): string {
  if (__DEVELOPMENT_MODE__) {
    return path
  }

  return `/api/${service}${path}`
}

export const ANALYZER_API_PATH = '/api/analyzer'
export const ANALYZER_ASSESSMENT_NAMESPACES_PATH = `${ANALYZER_API_PATH}/assessment/namespaces`
export const ANALYZER_RUN_PATH = `${ANALYZER_API_PATH}/run`
export const ANALYZER_STATUS_PATH = `${ANALYZER_API_PATH}/status`
export const ANALYZER_CLEANUP_PATH = `${ANALYZER_API_PATH}/reports`
export const ANALYZER_REPORT_FILES_PATH = `${ANALYZER_API_PATH}/reports/files`

export const CORE_AI_API_PATH = '/api/core-ai'
export const CORE_AI_ANALYSIS_PATH = `${CORE_AI_API_PATH}/analysis`
export const CORE_AI_REPORT_STATUS_PATH = '/api/reports'
export const CORE_AI_REQUEST_TIMEOUT_MS = 120_000

export const SETTINGS_API_PATH = '/api/settings'
export const SYSTEM_SETTINGS_PATH = `${SETTINGS_API_PATH}/system-settings`
export const SYSTEM_SETTINGS_STATUS_PATH = `${SYSTEM_SETTINGS_PATH}/status`
// Raw image bytes (application/octet-stream) are sent/received on this endpoint.
export const SYSTEM_SETTINGS_LOGO_PATH = `${SYSTEM_SETTINGS_PATH}/logo`
export const SETTINGS_COSTUMERS_LIST_PATH = `${SETTINGS_API_PATH}/costumers-list`
export const SETTINGS_AUTHORS_PATH = `${SETTINGS_API_PATH}/authors`
export const SETTINGS_VERSIONS_PATH = `${SETTINGS_API_PATH}/versions`
// Documents are unique per documentName (PK/UK); versions relate to a document 1:n via documentName.
export const SETTINGS_DOCUMENTS_PATH = `${SETTINGS_API_PATH}/documents`
