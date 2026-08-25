import {
  SETTINGS_AUTHORS_PATH,
  SETTINGS_COSTUMERS_LIST_PATH,
  SETTINGS_DOCUMENT_VERSIONS_PATH,
  SETTINGS_VERSIONS_PATH,
} from '../config/api'
import { executeRequest } from './httpClient'

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

export type SaveDocumentVersionInput = {
  title: string
  projectManager: string
  costumer: string
  costumersListId: string
  authorId: string
  versionNumber: string
  markdownContent: string
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

function getResponseId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const id = (payload as Record<string, unknown>).id
  return typeof id === 'string' ? id : null
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

async function createVersion(versionNumber: string, markdownContent: string): Promise<string> {
  const response = await executeRequest('POST', SETTINGS_VERSIONS_PATH, {
    versionNumber,
    markdownContent,
  })
  const responseId = getResponseId(response.payload)
  if (responseId) {
    return responseId
  }

  const versionsResponse = await executeRequest('GET', SETTINGS_VERSIONS_PATH)
  if (!Array.isArray(versionsResponse.payload)) {
    throw new Error('The API did not return the created version.')
  }

  const createdVersion = versionsResponse.payload.find((item) => {
    if (typeof item !== 'object' || item === null) {
      return false
    }

    const record = item as Record<string, unknown>
    return record.versionNumber === versionNumber
      && record.markdownContent === markdownContent
      && typeof record.id === 'string'
  }) as Record<string, unknown> | undefined

  if (!createdVersion || typeof createdVersion.id !== 'string') {
    throw new Error('The API did not return the ID for the created version.')
  }

  return createdVersion.id
}

export async function fetchReportMetadataOptions(): Promise<ReportMetadataOptions> {
  const [customers, authors] = await Promise.all([
    fetchPeople(SETTINGS_COSTUMERS_LIST_PATH),
    fetchPeople(SETTINGS_AUTHORS_PATH),
  ])

  return { customers, authors }
}

export async function saveDocumentVersion(input: SaveDocumentVersionInput): Promise<void> {
  const versionId = await createVersion(input.versionNumber, input.markdownContent)

  await executeRequest('POST', SETTINGS_DOCUMENT_VERSIONS_PATH, {
    title: input.title,
    projectManager: input.projectManager,
    costumer: input.costumer,
    authorId: input.authorId,
    costumersListId: input.costumersListId,
    versionId,
  })
}
