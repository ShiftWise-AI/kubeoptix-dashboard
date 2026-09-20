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
  TextInput,
  TreeView,
  Title,
} from '@patternfly/react-core'
import type { TreeViewDataItem } from '@patternfly/react-core'
import { ChartLineIcon, FileAltIcon, FolderIcon, FolderOpenIcon, PlayIcon, TrashIcon, UserIcon } from '@patternfly/react-icons'
import ConfigurationsPage from './ConfigurationsPage'
import DocumentDependenciesPage from './DocumentDependenciesPage'
import type { DocumentReport } from './DocumentDependenciesPage'
import dashboardLogo from '../image/logo.png'
import { fetchSystemSettings } from './services/settingsService'
import type { SystemSettings } from './services/settingsService'
import { useI18n, type TranslationKey } from './i18n'
import {
  ANALYZER_ASSESSMENT_NAMESPACES_PATH,
  ANALYZER_REPORT_FILES_PATH,
  ANALYZER_STATUS_PATH,
  CORE_AI_REPORTS_PATH,
  getApiPath,
} from './config/api'
import { ApiRequestError, executeRequest } from './services/httpClient'
import { runAnalysis, type AnalysisMode } from './services/analysisService'
import { fetchAuthSession, logout, type AuthSession } from './services/authService'

type MenuKey = 'harvester' | 'analyzer' | 'reports' | 'configurations'
type ColorScheme = 'system' | 'dark'

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

const MESSAGE_DISMISS_DELAY_MS = 15_000

function useAutoDismissMessage(message: string | null, clearMessage: () => void) {
  const clearMessageRef = useRef(clearMessage)
  clearMessageRef.current = clearMessage

  useEffect(() => {
    if (!message) {
      return
    }

    const timeoutId = window.setTimeout(() => clearMessageRef.current(), MESSAGE_DISMISS_DELAY_MS)
    return () => window.clearTimeout(timeoutId)
  }, [message])
}

const HARVESTER_COLLECT_PATH = getApiPath('harvester', '/collect')
const HARVESTER_COLLECT_STATUS_PATH = getApiPath('harvester', '/collect/status')
const HARVESTER_CLEANUP_PATH = getApiPath('harvester', '/assessment')
const HARVESTER_ASSESSMENT_PATH = getApiPath('harvester', '/assessment')
const HARVESTER_NAMESPACES_PATH = getApiPath('harvester', '/namespaces')
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

function normalizeCollectionProgress(payload: unknown, invalidMessage: string): number {
  const rawProgress = typeof payload === 'number' ? payload : Number(payload)

  if (!Number.isFinite(rawProgress)) {
    throw new Error(invalidMessage)
  }

  return Math.min(100, Math.max(0, rawProgress))
}

function normalizeProgressResponse(payload: unknown, invalidMessage: string): number {
  if (typeof payload === 'object' && payload !== null && 'progress' in payload) {
    return normalizeCollectionProgress((payload as Record<string, unknown>).progress, invalidMessage)
  }

  return normalizeCollectionProgress(payload, invalidMessage)
}

function normalizeAssessmentTree(
  payload: unknown,
  parentPath = '',
  messages: { invalidTree: string; invalidNode: string } = {
    invalidTree: 'Invalid assessment file tree.',
    invalidNode: 'Invalid assessment file tree node.',
  },
): TreeViewDataItem {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(messages.invalidTree)
  }

  const node = payload as Record<string, unknown>
  if (typeof node.name !== 'string' || (node.type !== 'directory' && node.type !== 'file')) {
    throw new Error(messages.invalidNode)
  }

  const path = `${parentPath}/${node.name}`
  const isDirectory = node.type === 'directory'
  const children = Array.isArray(node.children)
    ? node.children.map((child) => normalizeAssessmentTree(child, path, messages))
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

// Removes the raw report file from disk via the core-ai-api report deletion endpoint.
// The API expects the filename as a path segment (DELETE /reports/{fileName}), not a JSON body.
async function deleteReportContent(fileName: string): Promise<void> {
  const response = await fetch(`${CORE_AI_REPORTS_PATH}/${encodeURIComponent(fileName)}`, {
    method: 'DELETE',
  })

  // Treat "already gone" as success so repeated/idempotent deletes don't surface an error.
  if (!response.ok && response.status !== 404) {
    const responseText = await response.text()
    let message = responseText || `Request failed with status ${response.status}`

    try {
      const payload = JSON.parse(responseText) as unknown
      if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
        const detail = (payload as { detail: unknown }).detail
        if (typeof detail === 'object' && detail !== null && 'message' in detail) {
          message = String((detail as { message: unknown }).message)
        } else if (typeof detail === 'string') {
          message = detail
        }
      } else if (typeof payload === 'object' && payload !== null && 'error' in payload) {
        message = String(payload.error)
      }
    } catch {
      // Keep the plain-text response as the error message.
    }

    throw new ApiRequestError(message, response.status, responseText)
  }
}

function App() {
  const { t, setLanguage, locale } = useI18n()
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => {
    const savedValue = window.localStorage.getItem('kubeoptix-color-scheme')
    return savedValue === 'dark' ? 'dark' : 'system'
  })
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [authError, setAuthError] = useState(false)
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => (
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ))
  const [activeMenu, setActiveMenu] = useState<MenuKey>('harvester')
  const [isSystemConfigured, setIsSystemConfigured] = useState<boolean | null>(null)
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
  const [mode, setMode] = useState<AnalysisMode>('predictive')
  const [isDeleteAssessmentModalOpen, setIsDeleteAssessmentModalOpen] = useState(false)
  const [isAssessmentFilesModalOpen, setIsAssessmentFilesModalOpen] = useState(false)
  const [analyzerReports, setAnalyzerReports] = useState<AnalyzerReportFile[]>([])
  const [isLoadingAnalyzerReports, setIsLoadingAnalyzerReports] = useState(false)
  const [analyzerReportsError, setAnalyzerReportsError] = useState<string | null>(null)
  const [assessmentTree, setAssessmentTree] = useState<TreeViewDataItem[]>([])
  const [isLoadingAssessmentTree, setIsLoadingAssessmentTree] = useState(false)
  const [assessmentTreeError, setAssessmentTreeError] = useState<string | null>(null)
  const [isCollectionInProgress, setIsCollectionInProgress] = useState(false)
  const [isCollectionStatusPolling, setIsCollectionStatusPolling] = useState(false)
  const [hasCollectionStarted, setHasCollectionStarted] = useState(false)
  const [collectionProgress, setCollectionProgress] = useState(0)
  const [collectionCompletionMessage, setCollectionCompletionMessage] = useState<TranslationKey | null>(null)
  const [collectionStatusError, setCollectionStatusError] = useState<string | null>(null)
  const [isAnalyzerStatusPolling, setIsAnalyzerStatusPolling] = useState(false)
  const [isPredictiveStatusPolling, setIsPredictiveStatusPolling] = useState(false)
  const [predictiveExecutionId, setPredictiveExecutionId] = useState<string | null>(null)
  const [isAnalyzerInProgress, setIsAnalyzerInProgress] = useState(false)
  const [hasAnalyzerStarted, setHasAnalyzerStarted] = useState(false)
  const [analyzerProgress, setAnalyzerProgress] = useState(0)
  const [analyzerCompletionMessage, setAnalyzerCompletionMessage] = useState<TranslationKey | null>(null)
  const [analyzerStatusError, setAnalyzerStatusError] = useState<string | null>(null)
  const [predictiveStatusError, setPredictiveStatusError] = useState<string | null>(null)

  const [collectResponse, setCollectResponse] = useState<ApiResponseState>(initialResponseState)
  const [cleanupAssessmentResponse, setCleanupAssessmentResponse] = useState<ApiResponseState>(initialResponseState)
  const [, setRunResponse] = useState<ApiResponseState>(initialResponseState)

  const mastheadLogo = dashboardLogo
  const collectionCompleted = hasCollectionStarted && !isCollectionInProgress && !collectResponse.error
  const analysisCompleted = hasAnalyzerStarted
    && !isAnalyzerInProgress
    && !analyzerStatusError
    && !predictiveStatusError

  useAutoDismissMessage(loadNamespacesError, () => setLoadNamespacesError(null))
  useAutoDismissMessage(loadAnalyzerNamespacesError, () => setLoadAnalyzerNamespacesError(null))
  useAutoDismissMessage(analyzerReportsError, () => setAnalyzerReportsError(null))
  useAutoDismissMessage(assessmentTreeError, () => setAssessmentTreeError(null))
  useAutoDismissMessage(collectionStatusError, () => setCollectionStatusError(null))
  useAutoDismissMessage(analyzerStatusError, () => setAnalyzerStatusError(null))
  useAutoDismissMessage(predictiveStatusError, () => setPredictiveStatusError(null))
  useAutoDismissMessage(collectionCompletionMessage, () => setCollectionCompletionMessage(null))
  useAutoDismissMessage(analyzerCompletionMessage, () => setAnalyzerCompletionMessage(null))

  useEffect(() => {
    if (__DEVELOPMENT_MODE__) {
      setAuthSession({ authenticated: true, username: 'development' })
      return
    }

    let active = true
    const loadSession = async () => {
      try {
        const session = await fetchAuthSession()
        if (!active) return
        setAuthSession(session)
        if (!session.authenticated) {
          setAuthError(true)
        } else {
          window.sessionStorage.removeItem('kubeoptix-auth-redirected')
        }
      } catch {
        if (active) setAuthError(true)
      }
    }

    void loadSession()
    const intervalId = window.setInterval(() => void loadSession(), 60_000)
    const handleExpired = () => {
      setAuthSession({ authenticated: false })
      setAuthError(true)
    }
    window.addEventListener('kubeoptix-auth-expired', handleExpired)
    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('kubeoptix-auth-expired', handleExpired)
    }
  }, [])

  useEffect(() => {
    if (!authError || __DEVELOPMENT_MODE__) return
    const alreadyRedirected = window.sessionStorage.getItem('kubeoptix-auth-redirected')
    if (alreadyRedirected) return
    window.sessionStorage.setItem('kubeoptix-auth-redirected', 'true')
    const timeoutId = window.setTimeout(() => {
      window.location.assign('/oauth2/start?rd=/')
    }, 1500)
    return () => window.clearTimeout(timeoutId)
  }, [authError])

  async function handleLogout() {
    try {
      await logout()
    } catch {
      setAuthError(true)
      return
    }
    window.location.assign('/oauth2/sign_out')
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }

    setSystemPrefersDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleSystemThemeChange)

    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [])

  useEffect(() => {
    const isDark = colorScheme === 'dark' || (colorScheme === 'system' && systemPrefersDark)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    document.documentElement.classList.toggle('pf-v6-theme-dark', isDark)
    window.localStorage.setItem('kubeoptix-color-scheme', colorScheme)
  }, [colorScheme, systemPrefersDark])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

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
        throw new Error(t('harvester.noNamespacesReturned'))
      }

      setAvailableNamespaces(parsedNamespaces)
      setSelectedNamespaces((previousSelection) => {
        return previousSelection.filter((item) => parsedNamespaces.includes(item))
      })
    } catch (error) {
      setLoadNamespacesError(error instanceof Error ? error.message : t('harvester.couldNotLoadNamespaces'))
      setAvailableNamespaces([])
      setSelectedNamespaces([])
    } finally {
      setIsLoadingNamespaces(false)
    }
  }

  useEffect(() => {
    void loadNamespaces()
  }, [])

  useEffect(() => {
    // The dashboard cannot be used until the system settings record is created at least once.
    void (async () => {
      try {
        const settings = await fetchSystemSettings()
        setIsSystemConfigured(settings !== null)
        if (!settings) {
          setActiveMenu('configurations')
          return
        }

        setLanguage(settings.language)
        setMode(settings.defaultExtractionMethod === 'ml' ? 'predictive' : 'generative')
      } catch {
        setIsSystemConfigured(null)
      }
    })()
  }, [setLanguage])

  function handleSettingsChange(settings: SystemSettings | null) {
    setIsSystemConfigured(settings !== null)
    if (settings) {
      setLanguage(settings.language)
      setMode(settings.defaultExtractionMethod === 'ml' ? 'predictive' : 'generative')
    }
  }

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
      setLoadAnalyzerNamespacesError(error instanceof Error ? error.message : t('analyzer.couldNotLoadNamespaces'))
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
      setAnalyzerReportsError(error instanceof Error ? error.message : t('analyzer.couldNotLoadReports'))
      setAnalyzerReports([])
    } finally {
      setIsLoadingAnalyzerReports(false)
    }
  }

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
      void loadNamespaces()
      return
    }

    setIsDeleteAssessmentModalOpen(false)
    setIsAssessmentFilesModalOpen(false)
    if (activeMenu === 'analyzer') {
      void loadAnalyzerNamespaces()
    } else if (activeMenu === 'reports') {
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
        const progress = normalizeCollectionProgress(result.payload, t('harvester.invalidProgress'))

        if (!isActive) {
          return
        }

        setCollectionProgress(progress)
        setCollectionStatusError(null)

        if (progress >= 100) {
          setIsCollectionStatusPolling(false)
          setIsCollectionInProgress(false)
          setCollectResponse((previousState) => ({ ...previousState, pending: false }))
          setCollectionCompletionMessage('harvester.collectionCompletedContinue')
          void loadNamespaces()
          void loadAnalyzerNamespaces()
          return
        }
      } catch (error) {
        if (!isActive) {
          return
        }

        setCollectionStatusError(
          error instanceof Error ? error.message : t('harvester.couldNotRetrieveStatus'),
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
        const tree = [normalizeAssessmentTree(result.payload, '', {
          invalidTree: t('harvester.invalidFileTree'),
          invalidNode: t('harvester.invalidFileTreeNode'),
        })]

        if (isActive) {
          setAssessmentTree(tree)
          setAssessmentTreeError(null)
        }
      } catch (error) {
        console.error('Error loading assessment tree:', error)

        if (isActive) {
          setAssessmentTreeError(
            error instanceof Error ? error.message : t('harvester.couldNotLoadAssessmentFiles'),
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
    if (!isPredictiveStatusPolling || !predictiveExecutionId) {
      return
    }

    let isActive = true
    let pollingTimeout: number | undefined
    const executionId = predictiveExecutionId

    async function pollPredictiveStatus() {
      try {
        const result = await executeRequest(
          'GET',
          `${CORE_AI_REPORTS_PATH}/${encodeURIComponent(executionId)}/status`,
        )
        const progress = normalizeProgressResponse(result.payload, t('harvester.invalidProgress'))

        if (!isActive) {
          return
        }

        setAnalyzerProgress(progress)
        setPredictiveStatusError(null)

        if (progress >= 100) {
          setIsPredictiveStatusPolling(false)
          setIsAnalyzerInProgress(false)
          setRunResponse((previousState) => ({ ...previousState, pending: false }))
          setAnalyzerCompletionMessage('analyzer.analysisCompletedOpenReports')
          void loadAnalyzerReports()
          return
        }
      } catch (error) {
        if (!isActive) {
          return
        }

        setPredictiveStatusError(
          error instanceof Error ? error.message : t('analyzer.couldNotRetrievePredictiveStatus'),
        )
      }

      pollingTimeout = window.setTimeout(pollPredictiveStatus, 2000)
    }

    void pollPredictiveStatus()

    return () => {
      isActive = false
      if (pollingTimeout !== undefined) {
        window.clearTimeout(pollingTimeout)
      }
    }
  }, [isPredictiveStatusPolling, predictiveExecutionId])

  useEffect(() => {
    if (!isAnalyzerStatusPolling) {
      return
    }

    let isActive = true
    let pollingTimeout: number | undefined

    async function pollAnalyzerStatus() {
      try {
        const result = await executeRequest('GET', ANALYZER_STATUS_PATH)
        const progress = normalizeProgressResponse(result.payload, t('harvester.invalidProgress'))

        if (!isActive) {
          return
        }

        setAnalyzerProgress(progress)
        setAnalyzerStatusError(null)

        if (progress >= 100) {
          setIsAnalyzerStatusPolling(false)
          setIsAnalyzerInProgress(false)
          setRunResponse((previousState) => ({ ...previousState, pending: false }))
          setAnalyzerCompletionMessage('analyzer.analysisCompletedOpenReports')
          void loadAnalyzerReports()
          return
        }
      } catch (error) {
        if (!isActive) {
          return
        }

        setAnalyzerStatusError(
          error instanceof Error ? error.message : t('analyzer.couldNotRetrieveStatus'),
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

  const collectionStepHint = isCollectionInProgress
    ? t('harvester.collecting')
    : collectionCompleted
      ? t('common.completed')
      : t('workflow.collectHint')

  const analyzerStepHint = isAnalyzerInProgress
    ? t('analyzer.analyzing')
    : analysisCompleted
      ? t('common.completed')
      : collectionCompleted
        ? t('workflow.analyzeHint')
        : t('harvester.collectionCompletedContinue')

  const reportsStepHint = isAnalyzerInProgress
    ? t('analyzer.analyzing')
    : analysisCompleted
      ? (analyzerReports.length > 0 ? t('workflow.reportsAvailable', { count: analyzerReports.length }) : t('workflow.viewGeneratedReports'))
      : t('workflow.viewGeneratedReports')

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
    setCollectionCompletionMessage(null)
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
          error: t('harvester.collectionAlreadyRunning'),
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
        error: error instanceof Error ? error.message : t('common.unknownRequestError'),
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
        error: error instanceof Error ? error.message : t('common.unknownRequestError'),
      })
    }
  }

  async function handleRunAnalyzer(event: FormEvent) {
    event.preventDefault()

    setAnalyzerProgress(0)
    setAnalyzerStatusError(null)
    setPredictiveStatusError(null)
    setAnalyzerCompletionMessage(null)
    setIsAnalyzerStatusPolling(false)
    setIsPredictiveStatusPolling(false)
    setPredictiveExecutionId(null)
    setIsAnalyzerInProgress(true)
    setHasAnalyzerStarted(true)
    setRunResponse((previousState) => ({
      ...previousState,
      pending: true,
      error: null,
    }))

    try {
      const result = await runAnalysis(mode, selectedAnalyzerNamespaces)

      if (mode === 'predictive') {
        if (!result.executionId) {
          throw new Error(t('analyzer.missingExecutionId'))
        }

        setPredictiveExecutionId(result.executionId)
        setIsPredictiveStatusPolling(true)
        setRunResponse({
          pending: true,
          statusCode: result.statusCode,
          payload: result.payload,
          error: null,
        })
        return
      }

      if (!result.requiresStatusPolling) {
        setAnalyzerProgress(100)
        setIsAnalyzerInProgress(false)
        setAnalyzerCompletionMessage('analyzer.analysisCompletedOpenReports')
        setRunResponse({
          pending: false,
          statusCode: result.statusCode,
          payload: result.payload,
          error: null,
        })
        void loadAnalyzerReports()
        return
      }

      setRunResponse({
        pending: true,
        statusCode: result.statusCode,
        payload: result.payload,
        error: null,
      })
      setIsAnalyzerStatusPolling(true)
    } catch (error) {
      if (mode === 'generative' && error instanceof ApiRequestError && error.statusCode === 409) {
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
        error: error instanceof Error ? error.message : t('common.unknownRequestError'),
      })
    }
  }

  const sidebar = (
    <PageSidebar className="pf-v5-c-page__sidebar">
      <Nav aria-label={t('nav.serviceSections')}>
        <NavList>
          <NavItem
            itemId="harvester"
            isActive={activeMenu === 'harvester'}
            disabled={isCollectionInProgress || isSystemConfigured === false}
            onClick={() => setActiveMenu('harvester')}
          >
            {t('nav.harvester')}
          </NavItem>
          <NavItem
            itemId="analyzer"
            isActive={activeMenu === 'analyzer'}
            disabled={isCollectionInProgress || isSystemConfigured === false}
            onClick={() => setActiveMenu('analyzer')}
          >
            {t('nav.analyzer')}
          </NavItem>
          <NavItem
            itemId="reports"
            isActive={activeMenu === 'reports'}
            disabled={isCollectionInProgress || isAnalyzerInProgress || isSystemConfigured === false}
            onClick={openAnalyzerReports}
          >
            {t('nav.reports')}
          </NavItem>
          <NavItem
            itemId="configurations"
            isActive={activeMenu === 'configurations'}
            onClick={() => setActiveMenu('configurations')}
          >
            {t('nav.configurations')}
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
                  <img className="app-logo" src={mastheadLogo} alt={t('app.logoAlt')} />
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
              {t('app.description')}
            </span>
            <div className="masthead-tools">
              {authSession?.authenticated ? (
                <Button
                  variant="plain"
                  icon={<UserIcon />}
                  onClick={() => void handleLogout()}
                  aria-label={t('auth.logout')}
                >
                  {authSession.username}
                  <span className="auth-logout-label">{t('auth.logout')}</span>
                </Button>
              ) : null}
              <Switch
                id="color-scheme-switch"
                label={colorScheme === 'dark' ? t('theme.dark') : t('theme.system')}
                isChecked={colorScheme === 'dark'}
                isDisabled={isCollectionInProgress}
                onChange={(_event, checked) => setColorScheme(checked ? 'dark' : 'system')}
              />
            </div>
          </MastheadContent>
        </Masthead>
      }
      sidebar={sidebar}
      isManagedSidebar
    >
      {authError ? (
        <PageSection>
          <Alert isInline variant="warning" title={t('auth.sessionExpired')} />
        </PageSection>
      ) : null}
      {isSystemConfigured === false ? (
        <PageSection>
          <Alert isInline variant="info" title={t('settings.initialRequired')}>
            {t('settings.initialRequiredBody')}
          </Alert>
        </PageSection>
      ) : null}
      <PageSection className="workflow-section">
        <nav className="workflow-stepper" aria-label={t('workflow.progress')}>
          <button
            type="button"
            className={`workflow-step${activeMenu === 'harvester' ? ' is-active' : ''}${collectionCompleted ? ' is-complete' : ''}`}
            onClick={() => setActiveMenu('harvester')}
            disabled={isSystemConfigured === false}
          >
            <span className="workflow-step-number">1</span>
            <span>
              <strong>{t('workflow.collectData')}</strong>
              <small>{collectionStepHint}</small>
            </span>
          </button>
          <span className="workflow-connector" aria-hidden="true" />
          <button
            type="button"
            className={`workflow-step${activeMenu === 'analyzer' ? ' is-active' : ''}${analysisCompleted ? ' is-complete' : ''}`}
            onClick={() => setActiveMenu('analyzer')}
            disabled={isSystemConfigured === false || isCollectionInProgress || (!collectionCompleted && availableAnalyzerNamespaces.length === 0)}
          >
            <span className="workflow-step-number">2</span>
            <span>
              <strong>{t('workflow.analyze')}</strong>
              <small>{analyzerStepHint}</small>
            </span>
          </button>
          <span className="workflow-connector" aria-hidden="true" />
          <button
            type="button"
            className={`workflow-step${activeMenu === 'reports' ? ' is-active' : ''}`}
            onClick={openAnalyzerReports}
            disabled={isSystemConfigured === false || isCollectionInProgress || isAnalyzerInProgress || (!analysisCompleted && analyzerReports.length === 0)}
          >
            <span className="workflow-step-number">3</span>
            <span>
              <strong>{t('workflow.reviewReports')}</strong>
              <small>{reportsStepHint}</small>
            </span>
          </button>
        </nav>
      </PageSection>
      {activeMenu === 'harvester' ? (
        <>
          <PageSection>
            <Card className="pf-v5-c-card">
              <CardHeader>
                <div className="collection-card-heading">
                  <Title headingLevel="h2" size="xl">{t('harvester.title')}</Title>
                  <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} className="collection-card-header">
                    <FlexItem>
                      <Title headingLevel="h3">
                        <PlayIcon /> {t('harvester.startCollection')}
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Button
                        variant="secondary"
                        icon={<FolderOpenIcon />}
                        onClick={() => setIsAssessmentFilesModalOpen(true)}
                      >
                        {t('harvester.viewFiles')}
                      </Button>
                    </FlexItem>
                  </Flex>
                </div>
              </CardHeader>
              <CardBody>
                <Form onSubmit={handleCollect}>
                  <FormGroup label={t('harvester.namespaces')} fieldId="namespaces-selector">
                    <Flex gap={{ default: 'gapSm' }}>
                      <FlexItem>
                        <TextInput
                          value={namespaceFilter}
                          id="namespace-filter"
                          onChange={(_event, value) => setNamespaceFilter(value)}
                          aria-label={t('harvester.filterNamespaces')}
                          placeholder={t('harvester.filterNamespaces')}
                          isDisabled={isCollectionInProgress}
                        />
                      </FlexItem>
                      <FlexItem>
                        <Button type="button" variant="secondary" onClick={selectFilteredNamespaces} isDisabled={isCollectionInProgress || filteredNamespaces.length === 0}>
                          {t('harvester.selectFiltered')}
                        </Button>
                      </FlexItem>
                      <FlexItem>
                        <Button type="button" variant="secondary" onClick={clearAllNamespaces} isDisabled={isCollectionInProgress || selectedNamespaces.length === 0}>
                          {t('harvester.clearAll')}
                        </Button>
                      </FlexItem>
                      <FlexItem>
                        <Button type="button" variant="link" onClick={loadNamespaces} isDisabled={isCollectionInProgress || isLoadingNamespaces}>
                          {isLoadingNamespaces ? t('common.refreshing') : t('common.refresh')}
                        </Button>
                      </FlexItem>
                    </Flex>
                    {loadNamespacesError ? (
                      <Alert isInline variant="danger" title={loadNamespacesError} />
                    ) : null}
                    <div className="namespace-selector-list" id="namespaces-selector">
                      {isLoadingNamespaces ? <Spinner size="md" /> : null}
                      {!isLoadingNamespaces && filteredNamespaces.length === 0 ? (
                        <small>{t('harvester.noNamespaces')}</small>
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
                      {t('common.selected')}: {selectedNamespaces.length}
                      {selectedNamespaces.length > 0 ? ` (${selectedNamespacesText})` : ''}
                    </small>
                  </FormGroup>
                  {!isCollectionInProgress && selectedNamespaces.length === 0 ? (
                    <Alert isInline variant="info" title={t('harvester.noNamespaces')}>
                      {t('workflow.collectHint')}
                    </Alert>
                  ) : null}
                  {selectedNamespaces.length > 0 && !isCollectionInProgress ? (
                    <Alert isInline variant="success" title={t('workflow.collectData')}>
                      {t('common.selected')}: {selectedNamespaces.length} ({selectedNamespacesText})
                    </Alert>
                  ) : null}
                  <div className="collect-run-actions">
                    <Button
                      type="button"
                      variant="danger"
                      icon={<TrashIcon />}
                      onClick={() => setIsDeleteAssessmentModalOpen(true)}
                      isDisabled={isCollectionInProgress || cleanupAssessmentResponse.pending}
                    >
                      {cleanupAssessmentResponse.pending ? <Spinner size="md" /> : t('harvester.deleteAll')}
                    </Button>
                    <Button
                      type="submit"
                      className="collect-run-button"
                      isDisabled={isCollectionInProgress || collectResponse.pending || selectedNamespaces.length === 0}
                    >
                      {collectResponse.pending ? <Spinner size="md" /> : t('common.run')}
                    </Button>
                  </div>
                  {hasCollectionStarted ? (
                    <div className="collection-progress" aria-live="polite">
                      <Alert
                        isInline
                        variant={collectionStatusError ? 'warning' : isCollectionInProgress ? 'info' : 'success'}
                        title={collectionStatusError
                          ? t('harvester.statusRetry')
                          : isCollectionInProgress
                            ? t('harvester.collecting')
                            : t('harvester.collectionCompleted')}
                      >
                        {collectionStatusError ? collectionStatusError : isCollectionInProgress ? t('harvester.collecting') : t('harvester.collectionCompleted')}
                      </Alert>
                      <Progress
                        value={collectionProgress}
                        title={t('harvester.collectionProgress')}
                        measureLocation="inside"
                      />
                      <p className="collection-progress-message">
                        {isCollectionInProgress
                          ? t('harvester.collecting')
                          : t('harvester.collectionCompleted')}
                      </p>
                      {collectionCompletionMessage ? (
                        <Alert isInline variant="success" title={t(collectionCompletionMessage)} />
                      ) : null}
                      {collectionStatusError ? (
                        <Alert
                          isInline
                          variant="warning"
                          title={t('harvester.statusRetry')}
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
            <ModalHeader title={t('common.confirmActionTitle')} labelId="delete-assessments-modal-title" />
            <ModalBody id="delete-assessments-modal-description">
              {t('harvester.deleteModalBody')}
            </ModalBody>
            <ModalFooter>
              <Button variant="danger" onClick={handleCleanupAssessment} isLoading={cleanupAssessmentResponse.pending}>
                {t('common.yesRun')}
              </Button>
              <Button variant="link" onClick={() => setIsDeleteAssessmentModalOpen(false)}>
                {t('common.cancel')}
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
            <ModalHeader title={t('harvester.assessmentFiles')} labelId="assessment-files-modal-title" />
            <ModalBody id="assessment-files-modal-description">
              {isLoadingAssessmentTree && assessmentTree.length === 0 ? (
                <div className="assessment-tree-loading">
                  <Spinner size="lg" aria-label={t('harvester.loadingAssessmentFiles')} />
                </div>
              ) : null}
              {assessmentTreeError ? (
                <p className="modal-feedback-message is-warning">{t('harvester.couldNotUpdateFileList', { error: assessmentTreeError })}</p>
              ) : null}
              {assessmentTree.length > 0 ? (
                <div className="assessment-tree-container">
                  <TreeView
                    aria-label={t('harvester.assessmentTree')}
                    data={assessmentTree}
                    hasGuides
                    hasAnimations
                  />
                </div>
              ) : null}
            </ModalBody>
          </Modal>

        </>
      ) : activeMenu === 'configurations' ? (
        <ConfigurationsPage onSettingsChange={handleSettingsChange} />
      ) : activeMenu === 'analyzer' ? (
        <>
          <PageSection>
            <Card className="pf-v5-c-card">
              <CardHeader>
                <div className="collection-card-heading">
                  <Title headingLevel="h2" size="xl">{t('analyzer.title')}</Title>
                  <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }} className="collection-card-header">
                    <FlexItem>
                      <Title headingLevel="h3">
                        <ChartLineIcon /> {t('analyzer.runAnalyzer')}
                      </Title>
                    </FlexItem>
                    <FlexItem>
                      <Button
                        variant="secondary"
                        icon={<FolderOpenIcon />}
                        onClick={openAnalyzerReports}
                        isDisabled={isAnalyzerInProgress}
                      >
                        {t('analyzer.viewReports')}
                      </Button>
                    </FlexItem>
                  </Flex>
                </div>
              </CardHeader>
              <CardBody>
                {!isLoadingAnalyzerNamespaces && !loadAnalyzerNamespacesError && availableAnalyzerNamespaces.length === 0 ? (
                  <Alert
                    isInline
                    variant="info"
                    title={t('analyzer.noAssessmentData')}
                    actionLinks={[
                      <Button key="go-to-harvester" variant="link" onClick={() => setActiveMenu('harvester')}>
                        {t('analyzer.goToHarvester')}
                      </Button>,
                    ]}
                  >
                    {t('analyzer.runCollectionFirst')}
                  </Alert>
                ) : null}
                <Form onSubmit={handleRunAnalyzer}>
                  <FormGroup label={t('analyzer.namespaces')} fieldId="analyzer-namespaces-selector">
                    <Flex gap={{ default: 'gapSm' }}>
                      <FlexItem>
                        <TextInput
                          value={analyzerNamespaceFilter}
                          id="analyzer-namespace-filter"
                          onChange={(_event, value) => setAnalyzerNamespaceFilter(value)}
                          aria-label={t('analyzer.filterNamespaces')}
                          placeholder={t('analyzer.filterNamespaces')}
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
                          {t('analyzer.selectFiltered')}
                        </Button>
                      </FlexItem>
                      <FlexItem>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={clearAllAnalyzerNamespaces}
                          isDisabled={isAnalyzerInProgress || selectedAnalyzerNamespaces.length === 0}
                        >
                          {t('analyzer.clearAll')}
                        </Button>
                      </FlexItem>
                      <FlexItem>
                        <Button
                          type="button"
                          variant="link"
                          onClick={loadAnalyzerNamespaces}
                          isDisabled={isAnalyzerInProgress || isLoadingAnalyzerNamespaces}
                        >
                          {isLoadingAnalyzerNamespaces ? t('common.refreshing') : t('common.refresh')}
                        </Button>
                      </FlexItem>
                    </Flex>
                    {loadAnalyzerNamespacesError ? (
                      <Alert isInline variant="danger" title={loadAnalyzerNamespacesError} />
                    ) : null}
                    <div className="namespace-selector-list" id="analyzer-namespaces-selector">
                      {isLoadingAnalyzerNamespaces ? <Spinner size="md" /> : null}
                      {!isLoadingAnalyzerNamespaces && filteredAnalyzerNamespaces.length === 0 ? (
                        <small>{t('analyzer.noNamespaces')}</small>
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
                      {t('common.selected')}: {selectedAnalyzerNamespaces.length}
                      {selectedAnalyzerNamespaces.length > 0 ? ` (${selectedAnalyzerNamespacesText})` : ''}
                    </small>
                  </FormGroup>
                  {!isAnalyzerInProgress && selectedAnalyzerNamespaces.length === 0 ? (
                    <Alert isInline variant="info" title={t('analyzer.noNamespaces')}>
                      {t('analyzer.runCollectionFirst')}
                    </Alert>
                  ) : null}
                  {selectedAnalyzerNamespaces.length > 0 && !isAnalyzerInProgress ? (
                    <Alert isInline variant="success" title={t('workflow.analyze')}>
                      {t('common.selected')}: {selectedAnalyzerNamespaces.length} ({selectedAnalyzerNamespacesText})
                    </Alert>
                  ) : null}
                  <FormGroup label={t('analyzer.mode')} fieldId="run-mode">
                    <Flex direction={{ default: 'column' }}>
                      <FlexItem>
                        <Radio
                          id="mode-predictive"
                          name="mode"
                          label={t('analyzer.modeMl')}
                          isChecked={mode === 'predictive'}
                          onChange={() => setMode('predictive')}
                        />
                      </FlexItem>
                      <FlexItem>
                        <Radio
                          id="mode-generative"
                          name="mode"
                          label={t('analyzer.modeLlm')}
                          isChecked={mode === 'generative'}
                          onChange={() => setMode('generative')}
                        />
                      </FlexItem>
                    </Flex>
                  </FormGroup>
                  <div className="collect-run-actions">
                    <Button
                      type="submit"
                      className="collect-run-button"
                      isDisabled={isAnalyzerInProgress || selectedAnalyzerNamespaces.length === 0}
                    >
                      {isAnalyzerInProgress ? <Spinner size="md" /> : t('common.run')}
                    </Button>
                  </div>
                  {hasAnalyzerStarted ? (
                    <div className="collection-progress" aria-live="polite">
                      <Alert
                        isInline
                        variant={predictiveStatusError || analyzerStatusError ? 'warning' : isAnalyzerInProgress ? 'info' : 'success'}
                        title={predictiveStatusError
                          ? t('analyzer.predictiveStatusRetry')
                          : analyzerStatusError
                            ? t('analyzer.statusRetry')
                            : isAnalyzerInProgress
                              ? t('analyzer.analyzing')
                              : t('analyzer.analysisCompleted')}
                      >
                        {predictiveStatusError
                          ? predictiveStatusError
                          : analyzerStatusError
                            ? analyzerStatusError
                            : isAnalyzerInProgress
                              ? t('analyzer.analyzing')
                              : t('analyzer.analysisCompleted')}
                      </Alert>
                      <Progress
                        value={analyzerProgress}
                        title={t('analyzer.progress')}
                        measureLocation="inside"
                      />
                      <p className="collection-progress-message">
                        {isAnalyzerInProgress
                          ? t('analyzer.analyzing')
                          : t('analyzer.analysisCompleted')}
                      </p>
                      {analyzerCompletionMessage ? (
                        <Alert isInline variant="success" title={t(analyzerCompletionMessage)} />
                      ) : null}
                      {analyzerStatusError ? (
                        <Alert
                          isInline
                          variant="warning"
                          title={t('analyzer.statusRetry')}
                        >
                          {analyzerStatusError}
                        </Alert>
                      ) : null}
                      {predictiveStatusError ? (
                        <Alert
                          isInline
                          variant="warning"
                          title={t('analyzer.predictiveStatusRetry')}
                        >
                          {predictiveStatusError}
                        </Alert>
                      ) : null}
                    </div>
                  ) : null}
                </Form>
              </CardBody>
            </Card>
          </PageSection>
        </>
      ) : (
        <DocumentDependenciesPage
          reports={analyzerReports satisfies DocumentReport[]}
          isLoadingReports={isLoadingAnalyzerReports}
          reportsError={analyzerReportsError}
          onRefreshReports={loadAnalyzerReports}
          fetchReportContent={fetchReportContent}
          saveReportContent={(fileName, content) => saveReportContent(fileName, content, new AbortController().signal)}
          deleteReportContent={deleteReportContent}
        />
      )}
    </Page>
  )
}

export default App
