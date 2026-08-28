import {
  SETTINGS_AUTHORS_PATH,
  SETTINGS_COSTUMERS_LIST_PATH,
  SETTINGS_DOCUMENTS_PATH,
  SETTINGS_VERSIONS_PATH,
} from '../config/api'
import { ApiRequestError, executeRequest } from './httpClient'

export type Person = {
  id: string
  name: string
  position: string
  email: string
}

export type ReportMetadataOptions = {
  customers: Person[]
  authors: Person[]
}

export type SaveDocumentInput = {
  // documentName is the base identity (derived from the report file name). The API only
  // stores one authorId/costumersListId per document row (PK/UK = documentName), so when
  // multiple authors/customers are selected, one document row per author x customer
  // combination is created/updated, all sharing the same base name + version number.
  documentName: string
  title: string
  projectManager: string
  costumer: string
  authorIds: string[]
  costumersListIds: string[]
  markdownContent: string
}

export type ReporterPdfParams = {
  customer: string
  description: string
  version: number
  author: string
  projectManager: string
}

const REPORTER_API_PATH = '/api/reporter'

// The version scale grows in 0.1 increments (0.1, 0.2, ...) with no upper cap.
const VERSION_INCREMENT = 0.1

function roundVersion(value: number): number {
  return Math.round(value * 10) / 10
}

function normalizePeople(payload: unknown): Person[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map((item): Person | null => {
      if (typeof item !== 'object' || item === null) {
        return null
      }

      const record = item as Record<string, unknown>
      if (typeof record.id !== 'string' || typeof record.name !== 'string') {
        return null
      }

      return {
        id: record.id,
        name: record.name,
        position: typeof record.position === 'string' ? record.position : '',
        email: typeof record.email === 'string' ? record.email : '',
      }
    })
    .filter((item): item is Person => item !== null)
    .sort((left, right) => left.name.localeCompare(right.name))
}

async function fetchPeople(path: string): Promise<Person[]> {
  const response = await executeRequest('GET', path)
  return normalizePeople(response.payload)
}

export async function fetchDocumentDependencies(): Promise<ReportMetadataOptions> {
  const [customers, authors] = await Promise.all([
    fetchPeople(SETTINGS_COSTUMERS_LIST_PATH),
    fetchPeople(SETTINGS_AUTHORS_PATH),
  ])
  return { customers, authors }
}

export async function createPerson(kind: 'author' | 'customer', input: Omit<Person, 'id'>): Promise<void> {
  await executeRequest('POST', kind === 'author' ? SETTINGS_AUTHORS_PATH : SETTINGS_COSTUMERS_LIST_PATH, input)
}

export async function deletePerson(kind: 'author' | 'customer', id: string): Promise<void> {
  const path = kind === 'author' ? SETTINGS_AUTHORS_PATH : SETTINGS_COSTUMERS_LIST_PATH
  await executeRequest('DELETE', `${path}/${encodeURIComponent(id)}`)
}

export async function fetchReportMetadataOptions(): Promise<ReportMetadataOptions> {
  const [customers, authors] = await Promise.all([
    fetchPeople(SETTINGS_COSTUMERS_LIST_PATH),
    fetchPeople(SETTINGS_AUTHORS_PATH),
  ])

  return { customers, authors }
}

function getDocumentPath(documentName: string): string {
  return `${SETTINGS_DOCUMENTS_PATH}/${encodeURIComponent(documentName)}`
}

// Author/customer UUIDs never contain "::", so this delimiter safely encodes the
// (baseName, authorId, costumersListId) combo into a single unique documentName.
const COMBO_DELIMITER = '::'
const COMBO_DOCUMENT_NAME_PATTERN = /^(.*)::([0-9a-fA-F-]{36})::([0-9a-fA-F-]{36})$/

function buildComboDocumentName(baseName: string, authorId: string, costumersListId: string): string {
  return `${baseName}${COMBO_DELIMITER}${authorId}${COMBO_DELIMITER}${costumersListId}`
}

function parseComboDocumentName(documentName: string): { baseName: string; authorId: string; costumersListId: string } | null {
  const match = COMBO_DOCUMENT_NAME_PATTERN.exec(documentName)
  if (!match) {
    return null
  }

  return { baseName: match[1], authorId: match[2], costumersListId: match[3] }
}

type DocumentRecord = {
  documentName: string
  title: string
  projectManager: string
  costumer: string
  authorId: string | null
  costumersListId: string | null
}

function normalizeDocumentRecord(payload: unknown): DocumentRecord | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const record = payload as Record<string, unknown>
  if (typeof record.documentName !== 'string') {
    return null
  }

  return {
    documentName: record.documentName,
    title: typeof record.title === 'string' ? record.title : '',
    projectManager: typeof record.projectManager === 'string' ? record.projectManager : '',
    costumer: typeof record.costumer === 'string' ? record.costumer : '',
    authorId: typeof record.authorId === 'string' ? record.authorId : null,
    costumersListId: typeof record.costumersListId === 'string' ? record.costumersListId : null,
  }
}

// Fetches the document by its unique documentName; returns null when it does not exist yet.
async function fetchDocument(documentName: string): Promise<DocumentRecord | null> {
  try {
    const response = await executeRequest('GET', getDocumentPath(documentName))
    return normalizeDocumentRecord(response.payload)
  } catch (error) {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      return null
    }
    throw error
  }
}

// Fetches every document row whose documentName belongs to this base name (i.e. every
// author x customer combo saved for the same report).
async function fetchDocumentCombos(baseName: string): Promise<DocumentRecord[]> {
  const response = await executeRequest('GET', SETTINGS_DOCUMENTS_PATH)
  if (!Array.isArray(response.payload)) {
    return []
  }

  return response.payload
    .map((item) => normalizeDocumentRecord(item))
    .filter((item): item is DocumentRecord => item !== null)
    .filter((item) => parseComboDocumentName(item.documentName)?.baseName === baseName)
}

// Checks whether a version already exists for this document (across all its author x customer
// combos) and, if so, returns the next version number (last saved version + 0.1). Otherwise 0.1.
export async function computeNextVersionNumber(baseName: string): Promise<number> {
  const versionsResponse = await executeRequest('GET', SETTINGS_VERSIONS_PATH)
  if (!Array.isArray(versionsResponse.payload)) {
    return VERSION_INCREMENT
  }

  const matchingVersionNumbers = versionsResponse.payload
    .map((item): number | null => {
      if (typeof item !== 'object' || item === null) {
        return null
      }

      const record = item as Record<string, unknown>
      const documentName = typeof record.documentName === 'string' ? record.documentName : ''
      if (parseComboDocumentName(documentName)?.baseName !== baseName) {
        return null
      }

      const versionNumber = typeof record.versionNumber === 'number'
        ? record.versionNumber
        : Number(record.versionNumber)

      return Number.isFinite(versionNumber) ? versionNumber : null
    })
    .filter((value): value is number => value !== null)

  if (matchingVersionNumbers.length === 0) {
    return VERSION_INCREMENT
  }

  return roundVersion(Math.max(...matchingVersionNumbers) + VERSION_INCREMENT)
}

export type ExistingDocumentSummary = {
  title: string
  projectManager: string
  costumer: string
  authorIds: string[]
  costumersListIds: string[]
  markdownContent: string
  versionNumber: number
}

// Finds the highest-numbered version among this base name's combo documents and returns its
// number + markdown content (markdownContent now lives only on `versions`, not `documents`).
async function fetchLatestVersionForBaseName(baseName: string): Promise<{ versionNumber: number; markdownContent: string } | null> {
  const versionsResponse = await executeRequest('GET', SETTINGS_VERSIONS_PATH)
  if (!Array.isArray(versionsResponse.payload)) {
    return null
  }

  let latest: { versionNumber: number; markdownContent: string } | null = null
  for (const item of versionsResponse.payload) {
    if (typeof item !== 'object' || item === null) {
      continue
    }

    const record = item as Record<string, unknown>
    const documentName = typeof record.documentName === 'string' ? record.documentName : ''
    if (parseComboDocumentName(documentName)?.baseName !== baseName) {
      continue
    }

    const versionNumber = typeof record.versionNumber === 'number'
      ? record.versionNumber
      : Number(record.versionNumber)

    if (!Number.isFinite(versionNumber)) {
      continue
    }

    if (!latest || versionNumber > latest.versionNumber) {
      latest = {
        versionNumber,
        markdownContent: typeof record.markdownContent === 'string' ? record.markdownContent : '',
      }
    }
  }

  return latest
}

// Looks up every document combo saved for this base name and aggregates them: authors/customers
// are the union across combos, and the markdown content/version number come from the latest
// saved version (documents no longer store markdownContent themselves).
export async function fetchExistingDocument(baseName: string): Promise<ExistingDocumentSummary | null> {
  const normalizedBaseName = baseName.trim()
  if (!normalizedBaseName) {
    return null
  }

  const combos = await fetchDocumentCombos(normalizedBaseName)
  if (combos.length === 0) {
    return null
  }

  const latestVersion = await fetchLatestVersionForBaseName(normalizedBaseName)

  const representative = combos[0]
  return {
    title: representative.title,
    projectManager: representative.projectManager,
    costumer: representative.costumer,
    authorIds: Array.from(new Set(
      combos.map((combo) => combo.authorId).filter((id): id is string => id !== null),
    )),
    costumersListIds: Array.from(new Set(
      combos.map((combo) => combo.costumersListId).filter((id): id is string => id !== null),
    )),
    markdownContent: latestVersion?.markdownContent ?? '',
    versionNumber: latestVersion?.versionNumber ?? 0,
  }
}

// Creates or updates one document row per selected author x customer combination (all sharing
// the base name + the same new version number), then appends a version snapshot for each combo.
export async function saveDocument(input: SaveDocumentInput): Promise<number> {
  if (input.authorIds.length === 0) {
    throw new Error('Select at least one author.')
  }

  if (input.costumersListIds.length === 0) {
    throw new Error('Select at least one customer.')
  }

  const nextVersion = await computeNextVersionNumber(input.documentName)

  for (const authorId of input.authorIds) {
    for (const costumersListId of input.costumersListIds) {
      const comboDocumentName = buildComboDocumentName(input.documentName, authorId, costumersListId)
      // DocumentRequest no longer has a markdownContent field; only `versions` stores it.
      const documentPayload = {
        documentName: comboDocumentName,
        title: input.title,
        projectManager: input.projectManager,
        costumer: input.costumer,
        authorId,
        costumersListId,
      }

      const existingDocument = await fetchDocument(comboDocumentName)
      if (existingDocument) {
        await executeRequest('PUT', getDocumentPath(comboDocumentName), documentPayload)
      } else {
        await executeRequest('POST', SETTINGS_DOCUMENTS_PATH, documentPayload)
      }

      // VersionRequest.versionNumber is a string field in the API (see /q/openapi), so the
      // numeric value is formatted with a fixed 1-decimal precision before sending it.
      await executeRequest('POST', SETTINGS_VERSIONS_PATH, {
        versionNumber: nextVersion.toFixed(1),
        markdownContent: input.markdownContent,
        documentName: comboDocumentName,
      })
    }
  }

  return nextVersion
}

// Removes every author x customer combo document row saved under this base name, if any.
export async function deleteDocument(baseName: string): Promise<void> {
  const combos = await fetchDocumentCombos(baseName)
  for (const combo of combos) {
    await executeRequest('DELETE', getDocumentPath(combo.documentName))
  }
}

// Lists every distinct base report name (documentName minus the author/customer combo suffix)
// that has at least one document saved in the database, used to prioritize DB-backed reports
// in the reports list before falling back to the disk listing API.
export async function fetchAllDocumentBaseNames(): Promise<string[]> {
  const response = await executeRequest('GET', SETTINGS_DOCUMENTS_PATH)
  if (!Array.isArray(response.payload)) {
    return []
  }

  const baseNames = response.payload
    .map((item) => normalizeDocumentRecord(item))
    .filter((item): item is DocumentRecord => item !== null)
    .map((item) => parseComboDocumentName(item.documentName)?.baseName)
    .filter((baseName): baseName is string => Boolean(baseName))

  return Array.from(new Set(baseNames))
}

function getReporterReportPath(fileName: string): string {
  return `${REPORTER_API_PATH}/report/${encodeURIComponent(fileName)}`
}

function getReporterReportPdfPath(fileName: string, params: ReporterPdfParams): string {
  const queryParams = new URLSearchParams({
    customer: params.customer,
    description: params.description,
    version: String(params.version),
    status: 'Draft',
    author: params.author,
  })
  queryParams.set('project-manager', params.projectManager)

  return `${getReporterReportPath(fileName)}/pdf?${queryParams.toString()}`
}

export async function fetchReportPdf(fileName: string, params: ReporterPdfParams): Promise<Blob> {
  const response = await fetch(getReporterReportPdfPath(fileName, params), {
    method: 'GET',
    headers: { Accept: 'application/pdf' },
  })

  if (!response.ok) {
    const responseText = await response.text()
    let message = responseText || `Request failed with status ${response.status}`

    try {
      const payload = JSON.parse(responseText) as unknown
      if (typeof payload === 'object' && payload !== null && 'error' in payload) {
        message = String(payload.error)
      }
    } catch {
      // Keep the plain-text response as the error message.
    }

    throw new ApiRequestError(message, response.status, responseText)
  }

  return response.blob()
}
