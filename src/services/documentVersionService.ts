import {
  SETTINGS_AUTHORS_PATH,
  SETTINGS_CUSTOMERS_PATH,
  SETTINGS_VERSIONS_PATH,
} from '../config/api'
import { ApiRequestError, executeRequest } from './httpClient'

type ReportMetadataOptions = {
  customers: string[]
  authors: string[]
  versions: string[]
  warnings: string[]
}

function normalizeOptions(
  payload: unknown,
  candidateKeys: readonly string[],
): string[] {
  function extractValue(item: unknown): string | null {
    if (typeof item === 'string') {
      const value = item.trim()
      return value.length > 0 ? value : null
    }

    if (typeof item !== 'object' || item === null) {
      return null
    }

    const record = item as Record<string, unknown>

    for (const key of candidateKeys) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim()
      }
    }

    return null
  }

  function normalizeArray(items: unknown[]): string[] {
    const options = items
      .map((item) => extractValue(item))
      .filter((item): item is string => Boolean(item))

    return Array.from(new Set(options)).sort((left, right) => left.localeCompare(right))
  }

  if (Array.isArray(payload)) {
    return normalizeArray(payload)
  }

  if (typeof payload !== 'object' || payload === null) {
    return []
  }

  const candidateArrays = ['items', 'data', 'content', 'results']
  const objectPayload = payload as Record<string, unknown>

  for (const key of candidateArrays) {
    if (Array.isArray(objectPayload[key])) {
      return normalizeArray(objectPayload[key] as unknown[])
    }
  }

  return []
}

async function fetchOptionsFromPath(
  path: string,
  candidateKeys: readonly string[],
): Promise<string[]> {
  const response = await executeRequest('GET', path)
  return normalizeOptions(response.payload, candidateKeys)
}

export async function fetchReportMetadataOptions(): Promise<ReportMetadataOptions> {
  const warnings: string[] = []

  const customersResult = await fetchOptionsFromPath(
    SETTINGS_CUSTOMERS_PATH,
    ['name', 'customerName', 'displayName', 'label', 'value'],
  ).catch((error: unknown) => {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      warnings.push('Customers endpoint is unavailable.')
      return []
    }

    warnings.push(error instanceof Error ? error.message : 'Could not load customers list.')
    return []
  })

  const authorsResult = await fetchOptionsFromPath(
    SETTINGS_AUTHORS_PATH,
    ['name', 'authorName', 'displayName', 'label', 'value'],
  ).catch((error: unknown) => {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      warnings.push('Authors endpoint is unavailable.')
      return []
    }

    warnings.push(error instanceof Error ? error.message : 'Could not load authors list.')
    return []
  })

  const versionsResult = await fetchOptionsFromPath(
    SETTINGS_VERSIONS_PATH,
    ['version', 'name', 'code', 'label', 'value'],
  ).catch((error: unknown) => {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      warnings.push('Versions endpoint is unavailable.')
      return []
    }

    warnings.push(error instanceof Error ? error.message : 'Could not load versions list.')
    return []
  })

  return {
    customers: customersResult,
    authors: authorsResult,
    versions: versionsResult,
    warnings,
  }
}
