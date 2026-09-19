import { SYSTEM_SETTINGS_LOGO_PATH, SYSTEM_SETTINGS_PATH, SYSTEM_SETTINGS_STATUS_PATH } from '../config/api'
import { ApiRequestError, executeRequest } from './httpClient'

export type Language = 'en' | 'pt' | 'es' | 'it'
export type SettingsStatus = 'active' | 'inactive'
export type ExtractionMethod = 'ml' | 'llm'

export type SystemSettings = {
  id: string
  language: Language
  cursorApiKey: string
  cursorModel: string
  llmApiKey: string
  llmModel: string
  status: SettingsStatus
  defaultExtractionMethod: ExtractionMethod
  hasLogo: boolean
  createdAt: string
}

export type SystemSettingsInput = {
  language: Language
  cursorApiKey: string
  cursorModel: string
  llmApiKey: string
  llmModel: string
  status: SettingsStatus
  defaultExtractionMethod: ExtractionMethod
}

// Returns null when no settings record exists yet (API responds 404).
export async function fetchSystemSettings(): Promise<SystemSettings | null> {
  try {
    const result = await executeRequest('GET', SYSTEM_SETTINGS_PATH)
    return result.payload as SystemSettings
  } catch (error) {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      return null
    }
    throw error
  }
}

// Lightweight check used to decide the initial screen without loading full settings.
export async function fetchSystemSettingsExists(): Promise<boolean> {
  try {
    await executeRequest('GET', SYSTEM_SETTINGS_STATUS_PATH)
    return true
  } catch (error) {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      return false
    }
    throw error
  }
}

// Used when no record exists yet: creates the single system settings record.
export async function createSystemSettings(input: SystemSettingsInput): Promise<SystemSettings> {
  const result = await executeRequest('PUT', SYSTEM_SETTINGS_PATH, input)
  return result.payload as SystemSettings
}

// Used when a record already exists: partially updates the system settings record.
export async function updateSystemSettings(input: Partial<SystemSettingsInput>): Promise<SystemSettings> {
  const result = await executeRequest('PATCH', SYSTEM_SETTINGS_PATH, input)
  return result.payload as SystemSettings
}

export const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024
export const LOGO_ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

export type LogoValidationError = 'unsupportedType' | 'tooLarge'

export function validateLogoFile(file: File): LogoValidationError | null {
  if (!LOGO_ACCEPTED_MIME_TYPES.includes(file.type)) {
    return 'unsupportedType'
  }

  if (file.size > LOGO_MAX_SIZE_BYTES) {
    return 'tooLarge'
  }

  return null
}

// The API expects the raw image bytes in the request body, not a multipart form.
export async function uploadSystemLogo(file: File): Promise<SystemSettings> {
  const response = await fetch(SYSTEM_SETTINGS_LOGO_PATH, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  })

  const text = await response.text()

  if (!response.ok) {
    throw new ApiRequestError(
      `Could not upload the logo (status ${response.status}).`,
      response.status,
      text,
    )
  }

  return JSON.parse(text) as SystemSettings
}

export async function deleteSystemLogo(): Promise<void> {
  await executeRequest('DELETE', SYSTEM_SETTINGS_LOGO_PATH)
}

// Returns an object URL for the stored logo, or null when no logo is stored.
// Callers must revoke the returned URL when it is no longer displayed.
export async function fetchSystemLogoUrl(): Promise<string | null> {
  const response = await fetch(SYSTEM_SETTINGS_LOGO_PATH, { method: 'GET' })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new ApiRequestError(
      `Could not load the logo (status ${response.status}).`,
      response.status,
      null,
    )
  }

  const blob = await response.blob()
  return blob.size > 0 ? URL.createObjectURL(blob) : null
}
