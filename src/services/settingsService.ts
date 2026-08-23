import { SYSTEM_SETTINGS_PATH, SYSTEM_SETTINGS_STATUS_PATH } from '../config/api'
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
