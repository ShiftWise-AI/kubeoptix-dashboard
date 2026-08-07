import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CodeBlock,
  CodeBlockCode,
  Flex,
  FlexItem,
  Form,
  FormGroup,
  Masthead,
  MastheadBrand,
  MastheadContent,
  Nav,
  NavItem,
  NavList,
  Page,
  PageSection,
  PageSidebar,
  Radio,
  Spinner,
  TextInput,
  Title,
} from '@patternfly/react-core'
import { ChartLineIcon, CubesIcon, PlayIcon, TrashIcon } from '@patternfly/react-icons'

type MenuKey = 'harvester' | 'analyzer'
type AnalyzerMode = 'local' | 'llm' | 'embedded'

type ApiResponseState = {
  pending: boolean
  statusCode: number | null
  payload: unknown
  error: string | null
}

const HARVESTER_COLLECT_PATH = '/api/harvester/collect'
const HARVESTER_CLEANUP_PATH = '/api/harvester/assessment'
const ANALYZER_RUN_PATH = '/api/analyzer/run'
const ANALYZER_CLEANUP_PATH = '/api/analyzer/reports'

const initialResponseState = (): ApiResponseState => ({
  pending: false,
  statusCode: null,
  payload: null,
  error: null,
})

async function executeRequest(
  method: 'POST' | 'DELETE',
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
    throw new Error(
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String(payload.error)
        : `Request failed with status ${response.status}`,
    )
  }

  return { statusCode: response.status, payload }
}

function ResponsePanel({ title, response }: { title: string; response: ApiResponseState }) {
  const variant = useMemo(() => {
    if (response.error) {
      return 'danger'
    }
    if (response.statusCode) {
      return 'success'
    }
    return 'info'
  }, [response.error, response.statusCode])

  return (
    <Card isCompact>
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
  const [activeMenu, setActiveMenu] = useState<MenuKey>('harvester')
  const [namespaces, setNamespaces] = useState('openshift-monitoring default')
  const [mode, setMode] = useState<AnalyzerMode>('local')

  const [collectResponse, setCollectResponse] = useState<ApiResponseState>(initialResponseState)
  const [cleanupAssessmentResponse, setCleanupAssessmentResponse] = useState<ApiResponseState>(initialResponseState)
  const [runResponse, setRunResponse] = useState<ApiResponseState>(initialResponseState)
  const [cleanupReportsResponse, setCleanupReportsResponse] = useState<ApiResponseState>(initialResponseState)

  async function handleCollect(event: FormEvent) {
    event.preventDefault()
    const requestBody = { namespaces: namespaces.trim() }

    setCollectResponse((previousState) => ({
      ...previousState,
      pending: true,
      error: null,
    }))

    try {
      const result = await executeRequest('POST', HARVESTER_COLLECT_PATH, requestBody)
      setCollectResponse({
        pending: false,
        statusCode: result.statusCode,
        payload: result.payload,
        error: null,
      })
    } catch (error) {
      setCollectResponse({
        pending: false,
        statusCode: null,
        payload: null,
        error: error instanceof Error ? error.message : 'Unknown request error',
      })
    }
  }

  async function handleCleanupAssessment() {
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
      const result = await executeRequest('POST', ANALYZER_RUN_PATH, { mode })
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
    <PageSidebar>
      <Nav aria-label="Service sections">
        <NavList>
          <NavItem itemId="harvester" isActive={activeMenu === 'harvester'} onClick={() => setActiveMenu('harvester')}>
            Harvester
          </NavItem>
          <NavItem itemId="analyzer" isActive={activeMenu === 'analyzer'} onClick={() => setActiveMenu('analyzer')}>
            Analyzer
          </NavItem>
        </NavList>
      </Nav>
    </PageSidebar>
  )

  return (
    <Page
      masthead={
        <Masthead>
          <MastheadBrand>
            <Flex alignItems={{ default: 'alignItemsCenter' }}>
              <FlexItem>
                <CubesIcon />
              </FlexItem>
              <FlexItem>
                <Title headingLevel="h1" size="2xl">
                  KubeOptix Dashboard
                </Title>
              </FlexItem>
            </Flex>
          </MastheadBrand>
          <MastheadContent>
            <small>PatternFly 6.6.1 frontend for Harvester and Analyzer APIs</small>
          </MastheadContent>
        </Masthead>
      }
      sidebar={sidebar}
      isManagedSidebar
    >
      <PageSection>
        <Title headingLevel="h2" size="xl">
          {activeMenu === 'harvester' ? 'Harvester API Operations' : 'Analyzer API Operations'}
        </Title>
        <p>All requests are routed through local proxy paths and forwarded to the cluster routes.</p>
      </PageSection>

      {activeMenu === 'harvester' ? (
        <>
          <PageSection>
            <Card>
              <CardHeader>
                <Title headingLevel="h3">
                  <PlayIcon /> Start collection
                </Title>
              </CardHeader>
              <CardBody>
                <Form onSubmit={handleCollect}>
                  <FormGroup
                    label="Namespaces"
                    fieldId="namespaces"
                  >
                    <TextInput
                      value={namespaces}
                      id="namespaces"
                      onChange={(_event, value) => setNamespaces(value)}
                      aria-label="Namespaces"
                    />
                    <p>Space-separated namespaces, for example: openshift-monitoring default</p>
                  </FormGroup>
                  <Button type="submit" isDisabled={collectResponse.pending || !namespaces.trim()}>
                    {collectResponse.pending ? <Spinner size="md" /> : 'POST /collect'}
                  </Button>
                </Form>
              </CardBody>
            </Card>
          </PageSection>

          <PageSection>
            <Card>
              <CardHeader>
                <Title headingLevel="h3">
                  <TrashIcon /> Clear assessment directory
                </Title>
              </CardHeader>
              <CardBody>
                <Button variant="danger" onClick={handleCleanupAssessment} isDisabled={cleanupAssessmentResponse.pending}>
                  {cleanupAssessmentResponse.pending ? <Spinner size="md" /> : 'DELETE /assessment'}
                </Button>
              </CardBody>
            </Card>
          </PageSection>

          <PageSection>
            <ResponsePanel title="Collect response" response={collectResponse} />
          </PageSection>
          <PageSection>
            <ResponsePanel title="Assessment cleanup response" response={cleanupAssessmentResponse} />
          </PageSection>
        </>
      ) : (
        <>
          <PageSection>
            <Card>
              <CardHeader>
                <Title headingLevel="h3">
                  <ChartLineIcon /> Run analyzer
                </Title>
              </CardHeader>
              <CardBody>
                <Form onSubmit={handleRunAnalyzer}>
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
                  <Button type="submit" isDisabled={runResponse.pending}>
                    {runResponse.pending ? <Spinner size="md" /> : 'POST /run'}
                  </Button>
                </Form>
              </CardBody>
            </Card>
          </PageSection>

          <PageSection>
            <Card>
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
