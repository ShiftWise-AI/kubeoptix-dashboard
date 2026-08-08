import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  CodeBlock,
  CodeBlockCode,
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
  Title,
} from '@patternfly/react-core'
import { ChartLineIcon, PlayIcon, TrashIcon } from '@patternfly/react-icons'
import dashboardLogo from '../image/logo.png'

type MenuKey = 'harvester' | 'analyzer'
type AnalyzerMode = 'local' | 'llm' | 'embedded'
type ColorScheme = 'light' | 'dark'

type ApiResponseState = {
  pending: boolean
  statusCode: number | null
  payload: unknown
  error: string | null
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

const HARVESTER_COLLECT_PATH = '/api/harvester/collect'
const HARVESTER_COLLECT_STATUS_PATH = '/api/harvester/collect/status'
const HARVESTER_CLEANUP_PATH = '/api/harvester/assessment'
const HARVESTER_NAMESPACES_PATH = '/api/harvester/namespaces'
const ANALYZER_RUN_PATH = '/api/analyzer/run'
const ANALYZER_CLEANUP_PATH = '/api/analyzer/reports'

const initialResponseState = (): ApiResponseState => ({
  pending: false,
  statusCode: null,
  payload: null,
  error: null,
})

function normalizeNamespacesResponse(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is string => typeof item === 'string').sort()
  }

  if (typeof payload !== 'object' || payload === null) {
    return []
  }

  const candidateKeys = ['namespaces', 'items', 'data']

  for (const key of candidateKeys) {
    const value = (payload as Record<string, unknown>)[key]
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string').sort()
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

function ResponsePanel({ title, response }: { title: string; response: ApiResponseState }) {
  const variant = useMemo(() => {
    if (response.statusCode === 409) {
      return 'warning'
    }
    if (response.error) {
      return 'danger'
    }
    if (response.statusCode) {
      return 'success'
    }
    return 'info'
  }, [response.error, response.statusCode])

  return (
    <Card isCompact className="pf-v5-c-card">
      <CardHeader>
        <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <Title headingLevel="h3">{title}</Title>
          </FlexItem>
          <FlexItem>
            <Badge isRead>{response.statusCode ?? 'n/a'}</Badge>
          </FlexItem>
        </Flex>
      </CardHeader>
      <CardBody>
        {response.error ? <Alert variant={variant} isInline title={response.error} /> : null}
        {!response.error && response.statusCode ? (
          <Alert variant={variant} isInline title="Request completed successfully." />
        ) : null}
        {!response.error && !response.statusCode ? <small>No request executed yet.</small> : null}
        <CodeBlock className="response-block">
          <CodeBlockCode>
            {response.payload ? JSON.stringify(response.payload, null, 2) : '{ }'}
          </CodeBlockCode>
        </CodeBlock>
      </CardBody>
    </Card>
  )
}

function App() {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => {
    const savedValue = window.localStorage.getItem('kubeoptix-color-scheme')
    return savedValue === 'dark' ? 'dark' : 'light'
  })
  const [activeMenu, setActiveMenu] = useState<MenuKey>('harvester')
  const [availableNamespaces, setAvailableNamespaces] = useState<string[]>([])
  const [selectedNamespaces, setSelectedNamespaces] = useState<string[]>([])
  const [namespaceFilter, setNamespaceFilter] = useState('')
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState(false)
  const [loadNamespacesError, setLoadNamespacesError] = useState<string | null>(null)
  const [mode, setMode] = useState<AnalyzerMode>('local')
  const [isDeleteAssessmentModalOpen, setIsDeleteAssessmentModalOpen] = useState(false)
  const [isCollectionInProgress, setIsCollectionInProgress] = useState(false)
  const [isCollectionStatusPolling, setIsCollectionStatusPolling] = useState(false)
  const [hasCollectionStarted, setHasCollectionStarted] = useState(false)
  const [collectionProgress, setCollectionProgress] = useState(0)
  const [collectionStatusError, setCollectionStatusError] = useState<string | null>(null)

  const [collectResponse, setCollectResponse] = useState<ApiResponseState>(initialResponseState)
  const [cleanupAssessmentResponse, setCleanupAssessmentResponse] = useState<ApiResponseState>(initialResponseState)
  const [runResponse, setRunResponse] = useState<ApiResponseState>(initialResponseState)
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

    setRunResponse((previousState) => ({
      ...previousState,
      pending: true,
      error: null,
    }))

    try {
      const result = await executeRequest('POST', ANALYZER_RUN_PATH, {
        mode,
        namespaces: selectedNamespacesText,
        selected_namespaces: selectedNamespaces,
      })
      setRunResponse({
        pending: false,
        statusCode: result.statusCode,
        payload: result.payload,
        error: null,
      })
    } catch (error) {
      setRunResponse({
        pending: false,
        statusCode: null,
        payload: null,
        error: error instanceof Error ? error.message : 'Unknown request error',
      })
    }
  }

  async function handleCleanupReports() {
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
        </NavList>
      </Nav>
    </PageSidebar>
  )

  return (
    <Page
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
          <MastheadContent className="masthead-tools">
            <Switch
              id="color-scheme-switch"
              label={colorScheme === 'dark' ? 'Dark' : 'Light'}
              isChecked={colorScheme === 'dark'}
              isDisabled={isCollectionInProgress}
              onChange={(_event, checked) => setColorScheme(checked ? 'dark' : 'light')}
            />
          </MastheadContent>
        </Masthead>
      }
      sidebar={sidebar}
      isManagedSidebar
    >
      <PageSection>
        <Title headingLevel="h2" size="xl">
          {activeMenu === 'harvester' ? 'KubeOptix Harvester' : 'Collector and anonymization operations'}
        </Title>
      </PageSection>

      {activeMenu === 'harvester' ? (
        <>
          <PageSection>
            <Card className="pf-v5-c-card">
              <CardHeader>
                <Title headingLevel="h3">
                  <PlayIcon /> Start collection
                </Title>
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
            <ModalHeader title="Delete all assessments?" labelId="delete-assessments-modal-title" />
            <ModalBody id="delete-assessments-modal-description">
              This permanently deletes all collected assessment data. This action cannot be undone.
            </ModalBody>
            <ModalFooter>
              <Button variant="danger" onClick={handleCleanupAssessment}>
                Delete all assessments
              </Button>
              <Button variant="link" onClick={() => setIsDeleteAssessmentModalOpen(false)}>
                Cancel
              </Button>
            </ModalFooter>
          </Modal>

        </>
      ) : (
        <>
          <PageSection>
            <Card className="pf-v5-c-card">
              <CardHeader>
                <Title headingLevel="h3">
                  <ChartLineIcon /> Run analyzer
                </Title>
              </CardHeader>
              <CardBody>
                <Form onSubmit={handleRunAnalyzer}>
                  <FormGroup label="Selected namespaces" fieldId="analyzer-namespaces">
                    <small id="analyzer-namespaces">
                      {selectedNamespaces.length > 0
                        ? `${selectedNamespaces.length} selected: ${selectedNamespacesText}`
                        : 'No namespaces selected. Go to Harvester and choose at least one namespace.'}
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
                      <FlexItem>
                        <Radio
                          id="mode-embedded"
                          name="mode"
                          label="embedded"
                          isChecked={mode === 'embedded'}
                          onChange={() => setMode('embedded')}
                        />
                      </FlexItem>
                    </Flex>
                    <p>Recommended for OpenShift: local</p>
                  </FormGroup>
                  <Button type="submit" isDisabled={runResponse.pending || selectedNamespaces.length === 0}>
                    {runResponse.pending ? <Spinner size="md" /> : 'POST /run'}
                  </Button>
                </Form>
              </CardBody>
            </Card>
          </PageSection>

          <PageSection>
            <Card className="pf-v5-c-card">
              <CardHeader>
                <Title headingLevel="h3">
                  <TrashIcon /> Clear reports directory
                </Title>
              </CardHeader>
              <CardBody>
                <Button variant="danger" onClick={handleCleanupReports} isDisabled={cleanupReportsResponse.pending}>
                  {cleanupReportsResponse.pending ? <Spinner size="md" /> : 'DELETE /reports'}
                </Button>
              </CardBody>
            </Card>
          </PageSection>

          <PageSection>
            <ResponsePanel title="Run response" response={runResponse} />
          </PageSection>
          <PageSection>
            <ResponsePanel title="Reports cleanup response" response={cleanupReportsResponse} />
          </PageSection>
        </>
      )}
    </Page>
  )
}

export default App
