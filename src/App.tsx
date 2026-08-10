import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  Masthead,
  MastheadBrand,
  MastheadContent,
  Menu,
  MenuContent,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSection,
  PageSidebar,
  Progress,
  Radio,
  Spinner,
  Switch,
  TextArea,
  TextInput,
  TreeView,
  Title,
} from '@patternfly/react-core'
import type { TreeViewDataItem } from '@patternfly/react-core'
import { ChartLineIcon, EyeIcon, FileAltIcon, FolderIcon, FolderOpenIcon, PlayIcon, TrashIcon } from '@patternfly/react-icons'
import MarkdownViewer from './MarkdownViewer'
import dashboardLogo from '../image/logo.png'

type MenuKey = 'harvester' | 'analyzer' | 'reports'
type AnalyzerMode = 'local' | 'llm'
type ColorScheme = 'light' | 'dark'
type ReportSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

type ApiResponseState = {
  pending: boolean
  statusCode: number | null
  payload: unknown
  error: string | null
}

type AnalyzerReportFile = {
  name: string
  createdAt: string | null
}

class ApiRequestError extends Error {
  readonly statusCode: number
  readonly payload: unknown

  constructor(message: string, statusCode: number, payload: unknown) {
    super(message)
    this.name = 'ApiRequestError'
    this.statusCode = statusCode
    this.payload = payload
  }
}

function getApiPath(service: 'harvester' | 'analyzer', path: string): string {
  if (__DEVELOPMENT_MODE__) {
    return path
  }

  return `/api/${service}${path}`
}

const HARVESTER_COLLECT_PATH = getApiPath('harvester', '/collect')
const HARVESTER_COLLECT_STATUS_PATH = getApiPath('harvester', '/collect/status')
const HARVESTER_CLEANUP_PATH = getApiPath('harvester', '/assessment')
const HARVESTER_ASSESSMENT_PATH = getApiPath('harvester', '/assessment')
const HARVESTER_NAMESPACES_PATH = getApiPath('harvester', '/namespaces')
const ANALYZER_API_PATH = '/api/analyzer'
const ANALYZER_ASSESSMENT_NAMESPACES_PATH = `${ANALYZER_API_PATH}/assessment/namespaces`
const ANALYZER_RUN_PATH = `${ANALYZER_API_PATH}/run`
const ANALYZER_STATUS_PATH = `${ANALYZER_API_PATH}/status`
const ANALYZER_CLEANUP_PATH = `${ANALYZER_API_PATH}/reports`
const ANALYZER_REPORT_FILES_PATH = `${ANALYZER_API_PATH}/reports/files`
const REPORTER_API_PATH = '/api/reporter'

function getReporterReportPath(fileName: string): string {
  return `${REPORTER_API_PATH}/report/${encodeURIComponent(fileName)}`
}

const initialResponseState = (): ApiResponseState => ({
  pending: false,
  statusCode: null,
  payload: null,
  error: null,
})

function normalizeNamespacesResponse(payload: unknown): string[] {
  function normalizeArray(values: unknown[]): string[] {
    const parsed = values
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (typeof item === 'object' && item !== null) {
          const candidate = item as Record<string, unknown>
          if (typeof candidate.name === 'string') {
            return candidate.name
          }
          if (typeof candidate.namespace === 'string') {
            return candidate.namespace
          }
          if (typeof candidate.folder === 'string') {
            return candidate.folder
          }
        }

        return null
      })
      .filter((item): item is string => Boolean(item))

    return Array.from(new Set(parsed)).sort()
  }

  if (Array.isArray(payload)) {
    return normalizeArray(payload)
  }

  if (typeof payload !== 'object' || payload === null) {
    return []
  }

  const candidateKeys = ['namespaces', 'folders', 'items', 'data']

  for (const key of candidateKeys) {
    const value = (payload as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      return normalizeArray(value)
    }

    if (typeof value === 'string') {
      return value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .sort()
    }
  }

  return []
}

function normalizeCollectionProgress(payload: unknown): number {
  const rawProgress = typeof payload === 'number' ? payload : Number(payload)

  if (!Number.isFinite(rawProgress)) {
    throw new Error('The collection status API returned an invalid percentage.')
  }

  return Math.min(100, Math.max(0, rawProgress))
}

function normalizeAssessmentTree(payload: unknown, parentPath = ''): TreeViewDataItem {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('The assessment API returned an invalid file tree.')
  }

  const node = payload as Record<string, unknown>
  if (typeof node.name !== 'string' || (node.type !== 'directory' && node.type !== 'file')) {
    throw new Error('The assessment API returned an invalid file tree node.')
  }

  const path = `${parentPath}/${node.name}`
  const isDirectory = node.type === 'directory'
  const children = Array.isArray(node.children)
    ? node.children.map((child) => normalizeAssessmentTree(child, path))
    : []

  return {
    id: path,
    name: node.name,
    icon: isDirectory ? <FolderIcon /> : <FileAltIcon />,
    expandedIcon: isDirectory ? <FolderOpenIcon /> : undefined,
    children: isDirectory ? children : undefined,
    defaultExpanded: parentPath === '',
  }
}

function normalizeAnalyzerReports(payload: unknown): AnalyzerReportFile[] {
  function normalizeEntry(entry: unknown): AnalyzerReportFile | null {
    if (typeof entry === 'string') {
      return { name: entry, createdAt: null }
    }

    if (typeof entry !== 'object' || entry === null) {
      return null
    }

    const candidate = entry as Record<string, unknown>
    if (typeof candidate.name !== 'string') {
      return null
    }

    return {
      name: candidate.name,
      createdAt: typeof candidate.created_at === 'string'
        ? candidate.created_at
        : typeof candidate.created_at_iso === 'string'
          ? candidate.created_at_iso
          : null,
    }
  }

  const filesSource = (() => {
    if (Array.isArray(payload)) {
      return payload
    }

    if (typeof payload !== 'object' || payload === null) {
      return []
    }

    const files = (payload as Record<string, unknown>).files
    return Array.isArray(files) ? files : []
  })()

  return filesSource
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is AnalyzerReportFile => entry !== null)
}

async function executeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>,
): Promise<{ statusCode: number; payload: unknown }> {
  const response = await fetch(path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : { status: response.statusText }

  if (!response.ok) {
    throw new ApiRequestError(
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String(payload.error)
        : `Request failed with status ${response.status}`,
      response.status,
      payload,
    )
  }

  return { statusCode: response.status, payload }
}

async function fetchReportContent(fileName: string): Promise<string> {
  const response = await fetch(getReporterReportPath(fileName), {
    method: 'GET',
    headers: { Accept: 'text/markdown, text/plain' },
  })
  const text = await response.text()

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`

    try {
      const payload = JSON.parse(text) as unknown
      if (typeof payload === 'object' && payload !== null && 'error' in payload) {
        message = String(payload.error)
      }
    } catch {
      if (text.trim()) {
        message = text
      }
    }

    throw new ApiRequestError(message, response.status, text)
  }

  try {
    const payload = JSON.parse(text) as unknown
    if (typeof payload === 'object' && payload !== null && 'content' in payload) {
      const content = (payload as Record<string, unknown>).content
      return typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    }
    return JSON.stringify(payload, null, 2)
  } catch {
    return text
  }
}

async function saveReportContent(fileName: string, content: string, signal: AbortSignal): Promise<void> {
  const response = await fetch(getReporterReportPath(fileName), {
    method: 'POST',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    body: content,
    signal,
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
}

function App() {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => {
    const savedValue = window.localStorage.getItem('kubeoptix-color-scheme')
    return savedValue === 'light' ? 'light' : 'dark'
  })
  const [activeMenu, setActiveMenu] = useState<MenuKey>('harvester')
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>([])
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([])
  const [namespaceFilter, setNamespaceFilter] = useState('')
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState(false)
  const [loadNamespacesError, setLoadNamespacesError] = useState<string | null>(null)
  const [availableAnalyzerNamespaces, setAvailableAnalyzerNamespaces] = useState<string[]>([])
  const [selectedAnalyzerNamespaces, setSelectedAnalyzerNamespaces] = useState<string[]>([])
  const [analyzerNamespaceFilter, setAnalyzerNamespaceFilter] = useState('')
  const [isLoadingAnalyzerNamespaces, setIsLoadingAnalyzerNamespaces] = useState(false)
  const [loadAnalyzerNamespacesError, setLoadAnalyzerNamespacesError] = useState<string | null>(null)
  const [hasAttemptedAutoLoadAnalyzerNamespaces, setHasAttemptedAutoLoadAnalyzerNamespaces] = useState(false)
  const [mode, setMode] = useState<AnalyzerMode>('local')
  const [isDeleteAssessmentModalOpen, setIsDeleteAssessmentModalOpen] = useState(false)
  const [isDeleteReportsModalOpen, setIsDeleteReportsModalOpen] = useState(false)
  const [isAssessmentFilesModalOpen, setIsAssessmentFilesModalOpen] = useState(false)
  const [analyzerReports, setAnalyzerReports] = useState<AnalyzerReportFile[]>([])
  const [isLoadingAnalyzerReports, setIsLoadingAnalyzerReports] = useState(false)
  const [analyzerReportsError, setAnalyzerReportsError] = useState<string | null>(null)
  const [selectedAnalyzerReport, setSelectedAnalyzerReport] = useState<AnalyzerReportFile | null>(null)
  const [analyzerReportContent, setAnalyzerReportContent] = useState('')
  const [isLoadingAnalyzerReportContent, setIsLoadingAnalyzerReportContent] = useState(false)
  const [analyzerReportContentError, setAnalyzerReportContentError] = useState<string | null>(null)
  const [reportSaveStatus, setReportSaveStatus] = useState<ReportSaveStatus>('idle')
  const [reportSaveError, setReportSaveError] = useState<string | null>(null)
  const lastSavedReport = useRef<{ fileName: string; content: string } | null>(null)
  const reportLoadSequence = useRef(0)
  const [isReportPreviewOpen, setIsReportPreviewOpen] = useState(false)
  const [assessmentTree, setAssessmentTree] = useState<TreeViewDataItem[]>([])
  const [isLoadingAssessmentTree, setIsLoadingAssessmentTree] = useState(false)
  const [assessmentTreeError, setAssessmentTreeError] = useState<string | null>(null)
  const [isCollectionInProgress, setIsCollectionInProgress] = useState(false)
  const [isCollectionStatusPolling, setIsCollectionStatusPolling] = useState(false)
  const [hasCollectionStarted, setHasCollectionStarted] = useState(false)
  const [collectionProgress, setCollectionProgress] = useState(0)
  const [collectionStatusError, setCollectionStatusError] = useState<string | null>(null)
  const [isAnalyzerStatusPolling, setIsAnalyzerStatusPolling] = useState(false)
  const [isAnalyzerInProgress, setIsAnalyzerInProgress] = useState(false)
  const [hasAnalyzerStarted, setHasAnalyzerStarted] = useState(false)
  const [analyzerProgress, setAnalyzerProgress] = useState(0)
  const [analyzerStatusError, setAnalyzerStatusError] = useState<string | null>(null)

  const [collectResponse, setCollectResponse] = useState<ApiResponseState>(initialResponseState)
  const [cleanupAssessmentResponse, setCleanupAssessmentResponse] = useState<ApiResponseState>(initialResponseState)
  const [, setRunResponse] = useState<ApiResponseState>(initialResponseState)
  const [cleanupReportsResponse, setCleanupReportsResponse] = useState<ApiResponseState>(initialResponseState)

  const mastheadLogo = dashboardLogo

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorScheme)
    document.documentElement.classList.toggle('pf-v6-theme-dark', colorScheme === 'dark')
    window.localStorage.setItem('kubeoptix-color-scheme', colorScheme)
  }, [colorScheme])

  const filteredNamespaces = useMemo(() => {
    const filterText = namespaceFilter.trim().toLowerCase()
    if (!filterText) {
      return availableNamespaces
    }
    return availableNamespaces.filter((item) => item.toLowerCase().includes(filterText))
  }, [availableNamespaces, namespaceFilter])

  const selectedNamespacesText = useMemo(() => selectedNamespaces.join(' '), [selectedNamespaces])
  const filteredAnalyzerNamespaces = useMemo(() => {
    const filterText = analyzerNamespaceFilter.trim().toLowerCase()
    if (!filterText) {
      return availableAnalyzerNamespaces
    }
    return availableAnalyzerNamespaces.filter((item) => item.toLowerCase().includes(filterText))
  }, [availableAnalyzerNamespaces, analyzerNamespaceFilter])

  const selectedAnalyzerNamespacesText = useMemo(
    () => selectedAnalyzerNamespaces.join(' '),
    [selectedAnalyzerNamespaces],
  )

  async function loadNamespaces() {
    setIsLoadingNamespaces(true)
    setLoadNamespacesError(null)

    try {
      const result = await executeRequest('GET', HARVESTER_NAMESPACES_PATH)
      const parsedNamespaces = normalizeNamespacesResponse(result.payload)

      if (parsedNamespaces.length === 0) {
        throw new Error('No namespaces were returned by the API.')
      }

      setAvailableNamespaces(parsedNamespaces)
      setSelectedNamespaces((previousSelection) => {
        return previousSelection.filter((item) => parsedNamespaces.includes(item))
      })
    } catch (error) {
      setLoadNamespacesError(error instanceof Error ? error.message : 'Could not load namespaces.')
      setAvailableNamespaces([])
      setSelectedNamespaces([])
    } finally {
      setIsLoadingNamespaces(false)
    }
  }

  useEffect(() => {
    void loadNamespaces()
  }, [])

  async function loadAnalyzerNamespaces() {
    setIsLoadingAnalyzerNamespaces(true)
    setLoadAnalyzerNamespacesError(null)

    try {
      const result = await executeRequest('GET', ANALYZER_ASSESSMENT_NAMESPACES_PATH)
      const parsedNamespaces = normalizeNamespacesResponse(result.payload)

      setAvailableAnalyzerNamespaces(parsedNamespaces)
      setSelectedAnalyzerNamespaces((previousSelection) => {
        return previousSelection.filter((item) => parsedNamespaces.includes(item))
      })
    } catch (error) {
      setLoadAnalyzerNamespacesError(error instanceof Error ? error.message : 'Could not load namespaces.')
      setAvailableAnalyzerNamespaces([])
      setSelectedAnalyzerNamespaces([])
    } finally {
      setIsLoadingAnalyzerNamespaces(false)
    }
  }

  async function loadAnalyzerReports() {
    setIsLoadingAnalyzerReports(true)
    setAnalyzerReportsError(null)

    try {
      const result = await executeRequest('GET', ANALYZER_REPORT_FILES_PATH)
      const parsedReports = normalizeAnalyzerReports(result.payload)
      setAnalyzerReports(parsedReports)
    } catch (error) {
      setAnalyzerReportsError(error instanceof Error ? error.message : 'Could not load report files.')
      setAnalyzerReports([])
    } finally {
      setIsLoadingAnalyzerReports(false)
    }
  }

  async function openAnalyzerReport(report: AnalyzerReportFile) {
    const loadSequence = ++reportLoadSequence.current
    setSelectedAnalyzerReport(report)
    setAnalyzerReportContent('')
    setAnalyzerReportContentError(null)
    setReportSaveStatus('idle')
    setReportSaveError(null)
    lastSavedReport.current = null
    setIsLoadingAnalyzerReportContent(true)

    try {
      const content = await fetchReportContent(report.name)
      if (loadSequence !== reportLoadSequence.current) {
        return
      }
      lastSavedReport.current = { fileName: report.name, content }
      setAnalyzerReportContent(content)
    } catch (error) {
      if (loadSequence !== reportLoadSequence.current) {
        return
      }
      setAnalyzerReportContentError(
        error instanceof Error ? error.message : 'Could not load the report.',
      )
    } finally {
      if (loadSequence === reportLoadSequence.current) {
        setIsLoadingAnalyzerReportContent(false)
      }
    }
  }

  useEffect(() => {
    if (
      !selectedAnalyzerReport
      || isLoadingAnalyzerReportContent
      || analyzerReportContentError
      || (
        lastSavedReport.current?.fileName === selectedAnalyzerReport.name
        && lastSavedReport.current.content === analyzerReportContent
      )
    ) {
      return
    }

    const abortController = new AbortController()
    const fileName = selectedAnalyzerReport.name
    const content = analyzerReportContent
    const saveTimeout = window.setTimeout(() => {
      setReportSaveStatus('saving')
      setReportSaveError(null)

      void saveReportContent(fileName, content, abortController.signal)
        .then(() => {
          if (!abortController.signal.aborted) {
            lastSavedReport.current = { fileName, content }
            setReportSaveStatus('saved')
          }
        })
        .catch((error: unknown) => {
          if (!abortController.signal.aborted) {
            setReportSaveStatus('error')
            setReportSaveError(error instanceof Error ? error.message : 'Could not save the report.')
          }
        })
    }, 2000)

    return () => {
      window.clearTimeout(saveTimeout)
      abortController.abort()
    }
  }, [
    selectedAnalyzerReport,
    analyzerReportContent,
    isLoadingAnalyzerReportContent,
    analyzerReportContentError,
  ])

  function openAnalyzerReports() {
    setActiveMenu('reports')
  }

  useEffect(() => {
    if (
      activeMenu === 'analyzer'
      && availableAnalyzerNamespaces.length === 0
      && !isLoadingAnalyzerNamespaces
      && !hasAttemptedAutoLoadAnalyzerNamespaces
    ) {
      setHasAttemptedAutoLoadAnalyzerNamespaces(true)
      void loadAnalyzerNamespaces()
    }
  }, [
    activeMenu,
    availableAnalyzerNamespaces.length,
    isLoadingAnalyzerNamespaces,
    hasAttemptedAutoLoadAnalyzerNamespaces,
  ])

  useEffect(() => {
    if (activeMenu === 'harvester') {
      setIsDeleteReportsModalOpen(false)
      void loadNamespaces()
      return
    }

    setIsDeleteAssessmentModalOpen(false)
    setIsAssessmentFilesModalOpen(false)
    if (activeMenu === 'analyzer') {
      void loadAnalyzerNamespaces()
    } else {
      void loadAnalyzerReports()
    }
  }, [activeMenu])

  useEffect(() => {
    if (!isCollectionStatusPolling) {
      return
    }

    let isActive = true
    let pollingTimeout: number | undefined

    async function pollCollectionStatus() {
      try {
        const result = await executeRequest('GET', HARVESTER_COLLECT_STATUS_PATH)
        const progress = normalizeCollectionProgress(result.payload)

        if (!isActive) {
          return
        }

        setCollectionProgress(progress)
        setCollectionStatusError(null)

        if (progress >= 100) {
          setIsCollectionStatusPolling(false)
          setIsCollectionInProgress(false)
          setCollectResponse((previousState) => ({ ...previousState, pending: false }))
          return
        }
      } catch (error) {
        if (!isActive) {
          return
        }

        setCollectionStatusError(
          error instanceof Error ? error.message : 'Could not retrieve collection status.',
        )
      }

      pollingTimeout = window.setTimeout(pollCollectionStatus, 2000)
    }

    void pollCollectionStatus()

    return () => {
      isActive = false
      if (pollingTimeout !== undefined) {
        window.clearTimeout(pollingTimeout)
      }
    }
  }, [isCollectionStatusPolling])

  useEffect(() => {
    if (!isAssessmentFilesModalOpen) {
      return
    }

    let isActive = true
    let pollingTimeout: number | undefined

    async function pollAssessmentTree() {
      if (assessmentTree.length === 0) {
        setIsLoadingAssessmentTree(true)
      }

      try {
        const result = await executeRequest('GET', HARVESTER_ASSESSMENT_PATH)
        const tree = [normalizeAssessmentTree(result.payload)]

        if (isActive) {
          setAssessmentTree(tree)
          setAssessmentTreeError(null)
        }
      } catch (error) {
        console.error('Error loading assessment tree:', error)

        if (isActive) {
          setAssessmentTreeError(
            error instanceof Error ? error.message : 'Could not load assessment files.',
          )
        }
      } finally {
        if (isActive) {
          setIsLoadingAssessmentTree(false)
          pollingTimeout = window.setTimeout(pollAssessmentTree, 3000)
        }
      }
    }

    void pollAssessmentTree()

    return () => {
      isActive = false
      if (pollingTimeout !== undefined) {
        window.clearTimeout(pollingTimeout)
      }
    }
  }, [isAssessmentFilesModalOpen])

  useEffect(() => {
    if (!isAnalyzerStatusPolling) {
      return
    }

    let isActive = true
    let pollingTimeout: number | undefined

    async function pollAnalyzerStatus() {
      try {
        const result = await executeRequest('GET', ANALYZER_STATUS_PATH)
        const progress = normalizeCollectionProgress(result.payload)

        if (!isActive) {
          return
        }

        setAnalyzerProgress(progress)
        setAnalyzerStatusError(null)

        if (progress >= 100) {
          setIsAnalyzerStatusPolling(false)
          setIsAnalyzerInProgress(false)
          setRunResponse((previousState) => ({ ...previousState, pending: false }))
          void loadAnalyzerReports()
          return
        }
      } catch (error) {
        if (!isActive) {
          return
        }

        setAnalyzerStatusError(
          error instanceof Error ? error.message : 'Could not retrieve analyzer status.',
        )
      }

      pollingTimeout = window.setTimeout(pollAnalyzerStatus, 2000)
    }

    void pollAnalyzerStatus()

    return () => {
      isActive = false
      if (pollingTimeout !== undefined) {
        window.clearTimeout(pollingTimeout)
      }
    }
  }, [isAnalyzerStatusPolling])

  function toggleNamespace(namespace: string, checked: boolean) {
    setSelectedNamespaces((previousSelection) => {
      if (checked) {
        if (previousSelection.includes(namespace)) {
          return previousSelection
        }
        return [...previousSelection, namespace]
      }

      return previousSelection.filter((item) => item !== namespace)
    })
  }

  function selectFilteredNamespaces() {
    setSelectedNamespaces((previousSelection) => {
      const merged = new Set([...previousSelection, ...filteredNamespaces])
      return Array.from(merged)
    })
  }

  function clearAllNamespaces() {
    setSelectedNamespaces([])
  }

  function toggleAnalyzerNamespace(namespace: string, checked: boolean) {
    setSelectedAnalyzerNamespaces((previousSelection) => {
      if (checked) {
        if (previousSelection.includes(namespace)) {
          return previousSelection
        }
        return [...previousSelection, namespace]
      }

      return previousSelection.filter((item) => item !== namespace)
    })
  }

  function selectFilteredAnalyzerNamespaces() {
    setSelectedAnalyzerNamespaces((previousSelection) => {
      const merged = new Set([...previousSelection, ...filteredAnalyzerNamespaces])
      return Array.from(merged)
    })
  }

  function clearAllAnalyzerNamespaces() {
    setSelectedAnalyzerNamespaces([])
  }

  async function handleCollect(event: FormEvent) {
    event.preventDefault()
    const requestBody = { namespaces: selectedNamespacesText }

    setCollectionProgress(0)
    setCollectionStatusError(null)
    setIsCollectionStatusPolling(false)
    setHasCollectionStarted(true)
    setIsCollectionInProgress(true)
    setCollectResponse((previousState) => ({
      ...previousState,
      pending: true,
      error: null,
    }))

    try {
      const result = await executeRequest('POST', HARVESTER_COLLECT_PATH, requestBody)
      setCollectResponse({
        pending: true,
        statusCode: result.statusCode,
        payload: result.payload,
        error: null,
      })
      setIsCollectionStatusPolling(true)
    } catch (error) {
      if (error instanceof ApiRequestError && error.statusCode === 409) {
        setCollectResponse({
          pending: true,
          statusCode: error.statusCode,
          payload: error.payload,
          error: 'A collection is already running. Tracking its current progress.',
        })
        setIsCollectionStatusPolling(true)
        return
      }

      setIsCollectionStatusPolling(false)
      setIsCollectionInProgress(false)
      setHasCollectionStarted(false)
      setCollectResponse({
        pending: false,
        statusCode: null,
        payload: null,
        error: error instanceof Error ? error.message : 'Unknown request error',
      })
    }
  }

  async function handleCleanupAssessment() {
    setIsDeleteAssessmentModalOpen(false)
    setCleanupAssessmentResponse((previousState) => ({
      ...previousState,
      pending: true,
      error: null,
    }))

    try {
      const result = await executeRequest('DELETE', HARVESTER_CLEANUP_PATH)
      setCleanupAssessmentResponse({
        pending: false,
        statusCode: result.statusCode,
        payload: result.payload,
        error: null,
      })
    } catch (error) {
      setCleanupAssessmentResponse({
        pending: false,
        statusCode: null,
        payload: null,
        error: error instanceof Error ? error.message : 'Unknown request error',
      })
    }
  }

  async function handleRunAnalyzer(event: FormEvent) {
    event.preventDefault()

    setAnalyzerProgress(0)
    setAnalyzerStatusError(null)
    setIsAnalyzerStatusPolling(false)
    setIsAnalyzerInProgress(true)
    setHasAnalyzerStarted(true)
    setRunResponse((previousState) => ({
      ...previousState,
      pending: true,
      error: null,
    }))

    try {
      const result = await executeRequest('POST', ANALYZER_RUN_PATH, {
        mode,
        namespaces: selectedAnalyzerNamespaces,
      })
      setRunResponse({
        pending: true,
        statusCode: result.statusCode,
        payload: result.payload,
        error: null,
      })
      setIsAnalyzerStatusPolling(true)
    } catch (error) {
      if (error instanceof ApiRequestError && error.statusCode === 409) {
        setRunResponse({
          pending: true,
          statusCode: error.statusCode,
          payload: error.payload,
          error: null,
        })
        setIsAnalyzerStatusPolling(true)
        return
      }

      setHasAnalyzerStarted(false)
      setIsAnalyzerInProgress(false)
      setRunResponse({
        pending: false,
        statusCode: null,
        payload: null,
        error: error instanceof Error ? error.message : 'Unknown request error',
      })
    }
  }

  async function handleCleanupReports() {
    setIsDeleteReportsModalOpen(false)
    setCleanupReportsResponse((previousState) => ({
      ...previousState,
      pending: true,
      error: null,
    }))

    try {
      const result = await executeRequest('DELETE', ANALYZER_CLEANUP_PATH)
      setCleanupReportsResponse({
        pending: false,
        statusCode: result.statusCode,
        payload: result.payload,
        error: null,
      })
      void loadAnalyzerReports()
    } catch (error) {
      setCleanupReportsResponse({
        pending: false,
        statusCode: null,
        payload: null,
        error: error instanceof Error ? error.message : 'Unknown request error',
      })
    }
  }

  const sidebar = (
    <PageSidebar className="pf-v5-c-page__sidebar">
      <Nav aria-label="Service sections">
        <NavList>
          <NavItem itemId="harvester" isActive={activeMenu === 'harvester'} disabled={isCollectionInProgress} onClick={() => setActiveMenu('harvester')}>
            Harvester
          </NavItem>
          <NavItem itemId="analyzer" isActive={activeMenu === 'analyzer'} disabled={isCollectionInProgress} onClick={() => setActiveMenu('analyzer')}>
            Analyzer
          </NavItem>
          <NavItem
            itemId="reports"
            isActive={activeMenu === 'reports'}
            disabled={isCollectionInProgress || isAnalyzerInProgress}
            onClick={openAnalyzerReports}
          >
            Reports
          </NavItem>
        </NavList>
      </Nav>
    </PageSidebar>
  )

  return (
    <Page
      className="dashboard-page"
      masthead={
        <Masthead className="pf-v5-c-masthead">
          <MastheadBrand>
            <Flex alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>
                <div className="app-logo-shell">
                  <img className="app-logo" src={mastheadLogo} alt="ShiftWise AI logo" />
                </div>
              </FlexItem>
              <FlexItem>
                <Title headingLevel="h1" size="2xl">
                  ShiftWise AI
                </Title>
              </FlexItem>
            </Flex>
          </MastheadBrand>
          <MastheadContent className="masthead-content">
            <span className="app-description">
              Intelligence to Optimize OpenShift and Kubernetes Environments.
            </span>
            <div className="masthead-tools">
              <Switch
                id="color-scheme-switch"
                label={colorScheme === 'dark' ? 'Dark' : 'Light'}
                isChecked={colorScheme === 'dark'}
                isDisabled={isCollectionInProgress}
                onChange={(_event, checked) => setColorScheme(checked ? 'dark' : 'light')}
              />
            </div>
          </MastheadContent>
        </Masthead>
      }
      sidebar={sidebar}
      isManagedSidebar
    >
      {activeMenu === 'harvester' ? (
        <>
          <PageSection>
            <Card className="pf-v5-c-card">
              <CardHeader>
                <div className="collection-card-heading">
                  <Title headingLevel="h2" size="xl">KubeOptix Harvester</Title>
                  <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} className="collection-card-header">
                    <FlexItem>
                      <Title headingLevel="h3">
                        <PlayIcon /> Start collection
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Button
                        variant="secondary"
                        icon={<FolderOpenIcon />}
                        onClick={() => setIsAssessmentFilesModalOpen(true)}
                      >
                        View files
                      </Button>
                    </FlexItem>
                  </Flex>
                </div>
              </CardHeader>
              <CardBody>
                <Form onSubmit={handleCollect}>
                  <FormGroup label="Namespaces" fieldId="namespaces-selector">
                    <Flex gap={{ default: 'gapSm' }}>
                      <FlexItem>
                        <TextInput
                          value={namespaceFilter}
                          id="namespace-filter"
                          onChange={(_event, value) => setNamespaceFilter(value)}
                          aria-label="Filter namespaces"
                          placeholder="Filter namespaces"
                          isDisabled={isCollectionInProgress}
                        />
                      </FlexItem>
                      <FlexItem>
                        <Button type="button" variant="secondary" onClick={selectFilteredNamespaces} isDisabled={isCollectionInProgress || filteredNamespaces.length === 0}>
                          Select filtered
                        </Button>
                      </FlexItem>
                      <FlexItem>
                        <Button type="button" variant="secondary" onClick={clearAllNamespaces} isDisabled={isCollectionInProgress || selectedNamespaces.length === 0}>
                          Clear all
                        </Button>
                      </FlexItem>
                      <FlexItem>
                        <Button type="button" variant="link" onClick={loadNamespaces} isDisabled={isCollectionInProgress || isLoadingNamespaces}>
                          {isLoadingNamespaces ? 'Refreshing...' : 'Refresh'}
                        </Button>
                      </FlexItem>
                    </Flex>
                    {loadNamespacesError ? (
                      <Alert isInline variant="danger" title={loadNamespacesError} />
                    ) : null}
                    <div className="namespace-selector-list" id="namespaces-selector">
                      {isLoadingNamespaces ? <Spinner size="md" /> : null}
                      {!isLoadingNamespaces && filteredNamespaces.length === 0 ? (
                        <small>No namespaces found.</small>
                      ) : null}
                      {!isLoadingNamespaces
                        ? filteredNamespaces.map((namespace) => (
                          <Checkbox
                            key={namespace}
                            id={`namespace-${namespace}`}
                            label={namespace}
                            isChecked={selectedNamespaces.includes(namespace)}
                            isDisabled={isCollectionInProgress}
                            onChange={(_event, checked) => toggleNamespace(namespace, checked)}
                          />
                        ))
                        : null}
                    </div>
                    <small>
                      Selected: {selectedNamespaces.length}
                      {selectedNamespaces.length > 0 ? ` (${selectedNamespacesText})` : ''}
                    </small>
                  </FormGroup>
                  <div className="collect-run-actions">
                    <Button
                      type="button"
                      variant="danger"
                      icon={<TrashIcon />}
                      onClick={() => setIsDeleteAssessmentModalOpen(true)}
                      isDisabled={isCollectionInProgress || cleanupAssessmentResponse.pending}
                    >
                      {cleanupAssessmentResponse.pending ? <Spinner size="md" /> : 'DELETE ALL'}
                    </Button>
                    <Button
                      type="submit"
                      className="collect-run-button"
                      isDisabled={isCollectionInProgress || collectResponse.pending || selectedNamespaces.length === 0}
                    >
                      {collectResponse.pending ? <Spinner size="md" /> : 'Run'}
                    </Button>
                  </div>
                  {hasCollectionStarted ? (
                    <div className="collection-progress" aria-live="polite">
                      <Progress
                        value={collectionProgress}
                        title="Collection progress"
                        measureLocation="inside"
                      />
                      <p className="collection-progress-message">
                        {isCollectionInProgress
                          ? 'Collecting data. Status updates every 2 seconds.'
                          : 'Collection completed.'}
                      </p>
                      {collectionStatusError ? (
                        <Alert
                          isInline
                          variant="warning"
                          title="Could not update collection status. Retrying in 2 seconds."
                        >
                          {collectionStatusError}
                        </Alert>
                      ) : null}
                    </div>
                  ) : null}
                </Form>
              </CardBody>
            </Card>
          </PageSection>

          <Modal
            variant={ModalVariant.small}
            isOpen={isDeleteAssessmentModalOpen}
            onClose={() => setIsDeleteAssessmentModalOpen(false)}
          >
            <ModalHeader title="Do you want to perform this action?" labelId="delete-assessments-modal-title" />
            <ModalBody id="delete-assessments-modal-description">
              This action will remove all assessment data.
            </ModalBody>
            <ModalFooter>
              <Button variant="danger" onClick={handleCleanupAssessment} isLoading={cleanupAssessmentResponse.pending}>
                Yes, run
              </Button>
              <Button variant="link" onClick={() => setIsDeleteAssessmentModalOpen(false)}>
                Cancel
              </Button>
            </ModalFooter>
          </Modal>

          <Modal
            className="assessment-files-modal-box"
            backdropClassName="assessment-files-modal-backdrop"
            width="min(42rem, 92vw)"
            isOpen={isAssessmentFilesModalOpen}
            onClose={() => setIsAssessmentFilesModalOpen(false)}
          >
            <ModalHeader title="Assessment files" labelId="assessment-files-modal-title" />
            <ModalBody id="assessment-files-modal-description">
              {isLoadingAssessmentTree && assessmentTree.length === 0 ? (
                <div className="assessment-tree-loading">
                  <Spinner size="lg" aria-label="Loading assessment files" />
                </div>
              ) : null}
              {assessmentTreeError ? (
                <p className="modal-feedback-message is-warning">Could not update the file list: {assessmentTreeError}</p>
              ) : null}
              {assessmentTree.length > 0 ? (
                <div className="assessment-tree-container">
                  <TreeView
                    aria-label="Assessment file hierarchy"
                    data={assessmentTree}
                    hasGuides
                    hasAnimations
                  />
                </div>
              ) : null}
            </ModalBody>
          </Modal>

        </>
      ) : activeMenu === 'analyzer' ? (
        <>
          <PageSection>
            <Card className="pf-v5-c-card">
              <CardHeader>
                <div className="collection-card-heading">
                  <Title headingLevel="h2" size="xl">KubeOptix Analizer</Title>
                  <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} className="collection-card-header">
                    <FlexItem>
                      <Title headingLevel="h3">
                        <ChartLineIcon /> Run analyzer
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Button
                        variant="secondary"
                        icon={<FolderOpenIcon />}
                        onClick={openAnalyzerReports}
                        isDisabled={isAnalyzerInProgress}
                      >
                        View reports
                      </Button>
                    </FlexItem>
                  </Flex>
                </div>
              </CardHeader>
              <CardBody>
                <Form onSubmit={handleRunAnalyzer}>
                  <FormGroup label="Namespaces" fieldId="analyzer-namespaces-selector">
                    <Flex gap={{ default: 'gapSm' }}>
                      <FlexItem>
                        <TextInput
                          value={analyzerNamespaceFilter}
                          id="analyzer-namespace-filter"
                          onChange={(_event, value) => setAnalyzerNamespaceFilter(value)}
                          aria-label="Filter analyzer namespaces"
                          placeholder="Filter namespaces"
                          isDisabled={isAnalyzerInProgress}
                        />
                      </FlexItem>
                      <FlexItem>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={selectFilteredAnalyzerNamespaces}
                          isDisabled={isAnalyzerInProgress || filteredAnalyzerNamespaces.length === 0}
                        >
                          Select filtered
                        </Button>
                      </FlexItem>
                      <FlexItem>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={clearAllAnalyzerNamespaces}
                          isDisabled={isAnalyzerInProgress || selectedAnalyzerNamespaces.length === 0}
                        >
                          Clear all
                        </Button>
                      </FlexItem>
                      <FlexItem>
                        <Button
                          type="button"
                          variant="link"
                          onClick={loadAnalyzerNamespaces}
                          isDisabled={isAnalyzerInProgress || isLoadingAnalyzerNamespaces}
                        >
                          {isLoadingAnalyzerNamespaces ? 'Refreshing...' : 'Refresh'}
                        </Button>
                      </FlexItem>
                    </Flex>
                    {loadAnalyzerNamespacesError ? (
                      <Alert isInline variant="danger" title={loadAnalyzerNamespacesError} />
                    ) : null}
                    <div className="namespace-selector-list" id="analyzer-namespaces-selector">
                      {isLoadingAnalyzerNamespaces ? <Spinner size="md" /> : null}
                      {!isLoadingAnalyzerNamespaces && filteredAnalyzerNamespaces.length === 0 ? (
                        <small>No namespaces found.</small>
                      ) : null}
                      {!isLoadingAnalyzerNamespaces
                        ? filteredAnalyzerNamespaces.map((namespace) => (
                          <Checkbox
                            key={namespace}
                            id={`analyzer-namespace-${namespace}`}
                            label={namespace}
                            isChecked={selectedAnalyzerNamespaces.includes(namespace)}
                            isDisabled={isAnalyzerInProgress}
                            onChange={(_event, checked) => toggleAnalyzerNamespace(namespace, checked)}
                          />
                        ))
                        : null}
                    </div>
                    <small id="analyzer-namespaces">
                      Selected: {selectedAnalyzerNamespaces.length}
                      {selectedAnalyzerNamespaces.length > 0 ? ` (${selectedAnalyzerNamespacesText})` : ''}
                    </small>
                  </FormGroup>
                  <FormGroup label="Mode" fieldId="run-mode">
                    <Flex direction={{ default: 'column' }}>
                      <FlexItem>
                        <Radio
                          id="mode-local"
                          name="mode"
                          label="local"
                          isChecked={mode === 'local'}
                          onChange={() => setMode('local')}
                        />
                      </FlexItem>
                      <FlexItem>
                        <Radio
                          id="mode-llm"
                          name="mode"
                          label="llm"
                          isChecked={mode === 'llm'}
                          onChange={() => setMode('llm')}
                        />
                      </FlexItem>
                    </Flex>
                  </FormGroup>
                  <div className="collect-run-actions">
                    <Button
                      type="button"
                      variant="danger"
                      icon={<TrashIcon />}
                      onClick={() => setIsDeleteReportsModalOpen(true)}
                      isDisabled={isAnalyzerInProgress || cleanupReportsResponse.pending}
                    >
                      {cleanupReportsResponse.pending ? <Spinner size="md" /> : 'DELETE ALL'}
                    </Button>
                    <Button
                      type="submit"
                      className="collect-run-button"
                      isDisabled={isAnalyzerInProgress || selectedAnalyzerNamespaces.length === 0}
                    >
                      {isAnalyzerInProgress ? <Spinner size="md" /> : 'Run'}
                    </Button>
                  </div>
                  {hasAnalyzerStarted ? (
                    <div className="collection-progress" aria-live="polite">
                      <Progress
                        value={analyzerProgress}
                        title="Analyzer progress"
                        measureLocation="inside"
                      />
                      <p className="collection-progress-message">
                        {isAnalyzerInProgress
                          ? 'Analyzing data. Status updates every 2 seconds.'
                          : 'Analysis completed.'}
                      </p>
                      {analyzerStatusError ? (
                        <Alert
                          isInline
                          variant="warning"
                          title="Could not update analyzer status. Retrying in 2 seconds."
                        >
                          {analyzerStatusError}
                        </Alert>
                      ) : null}
                    </div>
                  ) : null}
                </Form>
              </CardBody>
            </Card>
          </PageSection>

          <Modal
            variant={ModalVariant.small}
            isOpen={isDeleteReportsModalOpen}
            onClose={() => setIsDeleteReportsModalOpen(false)}
          >
            <ModalHeader title="Do you want to perform this action?" labelId="delete-reports-modal-title" />
            <ModalBody id="delete-reports-modal-description">
              This action will remove all analyzer reports.
            </ModalBody>
            <ModalFooter>
              <Button variant="danger" onClick={handleCleanupReports} isLoading={cleanupReportsResponse.pending}>
                Yes, run
              </Button>
              <Button variant="link" onClick={() => setIsDeleteReportsModalOpen(false)}>
                Cancel
              </Button>
            </ModalFooter>
          </Modal>
        </>
      ) : (
        <PageSection>
          <Card className="pf-v5-c-card">
            <CardHeader>
              <div className="reports-page-heading">
                <Title headingLevel="h2" size="xl">Reports Analyzer</Title>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={loadAnalyzerReports}
                  isDisabled={isLoadingAnalyzerReports || isAnalyzerInProgress}
                >
                  {isLoadingAnalyzerReports ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              {analyzerReportsError ? (
                <Alert isInline variant="warning" title="Could not update report files">
                  {analyzerReportsError}
                </Alert>
              ) : null}
              <div className="reports-workspace">
                <div className="reports-list-panel">
                  {isLoadingAnalyzerReports ? (
                    <div className="assessment-tree-loading">
                      <Spinner size="lg" aria-label="Loading analyzer reports" />
                    </div>
                  ) : null}
                  {!isLoadingAnalyzerReports && !analyzerReportsError && analyzerReports.length === 0 ? (
                    <small>No reports found.</small>
                  ) : null}
                  {!isLoadingAnalyzerReports && analyzerReports.length > 0 ? (
                    <Menu className="report-files-menu" aria-label="Analyzer report files">
                      <MenuContent>
                        <MenuList>
                          {analyzerReports.map((report) => (
                            <MenuItem
                              key={report.name}
                              itemId={report.name}
                              isSelected={selectedAnalyzerReport?.name === report.name}
                              icon={<FileAltIcon />}
                              description={report.createdAt ?? undefined}
                              onClick={() => void openAnalyzerReport(report)}
                            >
                              {report.name}
                            </MenuItem>
                          ))}
                        </MenuList>
                      </MenuContent>
                    </Menu>
                  ) : null}
                </div>
                <section className="report-editor-panel" aria-live="polite">
                  <div className="report-editor-heading">
                    <Title headingLevel="h3" size="lg">
                      {selectedAnalyzerReport?.name ?? 'Select a report'}
                    </Title>
                    {selectedAnalyzerReport && !isLoadingAnalyzerReportContent && !analyzerReportContentError ? (
                      <div className="report-editor-actions">
                        <small className={`report-save-status report-save-status--${reportSaveStatus}`} role="status">
                          {reportSaveStatus === 'pending' ? 'Waiting to save' : null}
                          {reportSaveStatus === 'saving' ? 'Saving...' : null}
                          {reportSaveStatus === 'saved' ? 'Saved' : null}
                          {reportSaveStatus === 'error' ? 'Save failed' : null}
                        </small>
                        <Button
                          type="button"
                          variant="secondary"
                          icon={<EyeIcon />}
                          onClick={() => setIsReportPreviewOpen(true)}
                        >
                          View
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {isLoadingAnalyzerReportContent ? (
                    <div className="report-editor-loading">
                      <Spinner size="lg" aria-label="Loading analyzer report" />
                    </div>
                  ) : null}
                  {analyzerReportContentError ? (
                    <Alert isInline variant="danger" title="Could not load the report">
                      {analyzerReportContentError}
                    </Alert>
                  ) : null}
                  {reportSaveError ? (
                    <Alert isInline variant="danger" title="Could not save the report">
                      {reportSaveError}
                    </Alert>
                  ) : null}
                  {!selectedAnalyzerReport ? (
                    <p className="report-editor-empty">Choose a report from the menu to edit its Markdown content.</p>
                  ) : null}
                  {selectedAnalyzerReport && !isLoadingAnalyzerReportContent && !analyzerReportContentError ? (
                    <TextArea
                      className="report-markdown-editor"
                      id="report-markdown-editor"
                      aria-label="Markdown report editor"
                      value={analyzerReportContent}
                      onChange={(_event, value) => {
                        setAnalyzerReportContent(value)
                        setReportSaveStatus(
                          lastSavedReport.current?.fileName === selectedAnalyzerReport.name
                          && lastSavedReport.current.content === value
                            ? 'saved'
                            : 'pending',
                        )
                        setReportSaveError(null)
                      }}
                      resizeOrientation="vertical"
                    />
                  ) : null}
                </section>
              </div>
            </CardBody>
          </Card>
          <Modal
            className="report-preview-modal"
            width="min(76rem, 94vw)"
            isOpen={isReportPreviewOpen}
            onClose={() => setIsReportPreviewOpen(false)}
          >
            <ModalHeader
              title={selectedAnalyzerReport?.name ?? 'Report preview'}
              labelId="report-preview-modal-title"
            />
            <ModalBody id="report-preview-modal-description">
              <MarkdownViewer content={analyzerReportContent} colorScheme={colorScheme} />
            </ModalBody>
            <ModalFooter>
              <Button variant="primary" onClick={() => setIsReportPreviewOpen(false)}>Close</Button>
            </ModalFooter>
          </Modal>
        </PageSection>
      )}
    </Page>
  )
}

export default App
