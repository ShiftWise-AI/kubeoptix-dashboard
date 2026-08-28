import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, Flex, FlexItem, Form, FormGroup, Label, Menu, MenuContent, MenuItem, MenuList, Modal, ModalBody, ModalFooter, ModalHeader, ModalVariant, PageSection, Spinner, TextArea, TextInput, Title, Tooltip } from '@patternfly/react-core'
import { CheckCircleIcon, DownloadIcon, EyeIcon, FileAltIcon, FilePdfIcon, PencilAltIcon, PlusIcon, TrashIcon } from '@patternfly/react-icons'
import MarkdownViewer from './MarkdownViewer'
import {
  createPerson,
  deleteDocument,
  deletePerson,
  fetchDocumentDependencies,
  fetchExistingDocument,
  fetchReportPdf,
  saveDocument,
  type Person,
} from './services/documentVersionService'

type DialogKind = 'author' | 'customer' | null

export type DocumentReport = {
  name: string
  createdAt: string | null
}

type DocumentDependenciesPageProps = {
  reports: DocumentReport[]
  isLoadingReports: boolean
  reportsError: string | null
  onRefreshReports: () => void
  fetchReportContent: (fileName: string) => Promise<string>
  saveReportContent: (fileName: string, content: string) => Promise<void>
  deleteReportContent: (fileName: string) => Promise<void>
}

// Versioning status of a report's document, used to render the draft/versioned indicator.
type ReportDocumentStatus = {
  isVersioned: boolean
  versionNumber: number
}

type SavedDocumentForExport = {
  fileName: string
  customer: string
  description: string
  version: number
  author: string
  projectManager: string
}

// Snapshot of the last saved state for the selected report's document, used to detect edits.
type DocumentBaseline = {
  title: string
  projectManager: string
  costumer: string
  authorIds: string[]
  costumersListIds: string[]
  markdownContent: string
}

function sameIdSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((id, index) => id === sortedRight[index])
}

function DocumentDependenciesPage({
  reports,
  isLoadingReports,
  reportsError,
  onRefreshReports,
  fetchReportContent,
  saveReportContent,
  deleteReportContent,
}: DocumentDependenciesPageProps) {
  const [authors, setAuthors] = useState<Person[]>([])
  const [customers, setCustomers] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogKind, setDialogKind] = useState<DialogKind>(null)
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [email, setEmail] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [deletingPersonId, setDeletingPersonId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [projectManager, setProjectManager] = useState('')
  const [costumer, setCostumer] = useState('')
  // Author and Costumers list are multi-valued: the API only stores one authorId/costumersListId
  // per document row, so one document row is created per selected author x customer combination.
  const [authorIds, setAuthorIds] = useState<string[]>([])
  const [costumersListIds, setCostumersListIds] = useState<string[]>([])
  const [documentName, setDocumentName] = useState('')
  const [selectedReportName, setSelectedReportName] = useState('')
  const [markdownContent, setMarkdownContent] = useState('')
  const [isLoadingMarkdown, setIsLoadingMarkdown] = useState(false)
  const [markdownContentError, setMarkdownContentError] = useState<string | null>(null)
  const [isSavingDocument, setIsSavingDocument] = useState(false)
  const [documentMessage, setDocumentMessage] = useState<string | null>(null)
  const [savedDocumentForExport, setSavedDocumentForExport] = useState<SavedDocumentForExport | null>(null)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [pdfExportError, setPdfExportError] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<DocumentBaseline | null>(null)
  const [isCheckingExistingDocument, setIsCheckingExistingDocument] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  // Draft/versioned indicator per report, keyed by report file name.
  const [documentStatusByReport, setDocumentStatusByReport] = useState<Map<string, ReportDocumentStatus>>(new Map())
  const [deleteTargetReport, setDeleteTargetReport] = useState<string | null>(null)
  const [isDeletingReport, setIsDeletingReport] = useState(false)
  const [deleteReportError, setDeleteReportError] = useState<string | null>(null)
  const reportLoadSequence = useRef(0)

  async function loadDependencies() {
    setIsLoading(true)
    try {
      const dependencies = await fetchDocumentDependencies()
      setAuthors(dependencies.authors)
      setCustomers(dependencies.customers)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load document dependencies.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadDependencies() }, [])

  // Keep the selection consistent if the report list changes (e.g. after "Delete all").
  useEffect(() => {
    if (selectedReportName && !reports.some((report) => report.name === selectedReportName)) {
      void selectReport('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports])

  // Determine, for every listed report, whether it is still a draft (no saved version yet)
  // or already versioned, so the list can render a visual indicator per item.
  useEffect(() => {
    let cancelled = false

    async function loadStatuses() {
      const statusEntries = await Promise.all(reports.map(async (report) => {
        const documentName = report.name.replace(/\.md$/i, '')
        try {
          const existingDocument = await fetchExistingDocument(documentName)
          return [report.name, {
            isVersioned: existingDocument !== null,
            versionNumber: existingDocument?.versionNumber ?? 0,
          }] as const
        } catch {
          return [report.name, { isVersioned: false, versionNumber: 0 }] as const
        }
      }))

      if (!cancelled) {
        setDocumentStatusByReport(new Map(statusEntries))
      }
    }

    void loadStatuses()
    return () => { cancelled = true }
  }, [reports])

  function openDialog(kind: Exclude<DialogKind, null>) {
    setName(''); setPosition(''); setEmail(''); setDialogKind(kind)
  }

  function toggleAuthor(id: string, checked: boolean) {
    setAuthorIds((previousSelection) => (
      checked
        ? Array.from(new Set([...previousSelection, id]))
        : previousSelection.filter((item) => item !== id)
    ))
  }

  function toggleCostumersListEntry(id: string, checked: boolean) {
    setCostumersListIds((previousSelection) => (
      checked
        ? Array.from(new Set([...previousSelection, id]))
        : previousSelection.filter((item) => item !== id)
    ))
  }

  async function submit() {
    if (!dialogKind) return
    setIsSaving(true)
    try {
      await createPerson(dialogKind, { name, position, email })
      setDialogKind(null)
      await loadDependencies()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the dependency.')
    } finally { setIsSaving(false) }
  }

  async function removePerson(kind: 'author' | 'customer', person: Person) {
    setDeletingPersonId(person.id)
    setError(null)
    try {
      await deletePerson(kind, person.id)
      await loadDependencies()
    } catch (deleteError) {
      setError(deleteError instanceof Error
        ? deleteError.message
        : `Could not remove ${kind === 'author' ? 'the author' : 'the customer'}.`)
    } finally {
      setDeletingPersonId(null)
    }
  }

  async function submitDocument() {
    if (!title.trim() || !projectManager.trim() || !costumer.trim() || authorIds.length === 0 || costumersListIds.length === 0 || !selectedReportName || !markdownContent.trim()) {
      setDocumentMessage('Complete all document fields (select at least one author and one customer) before saving.')
      return
    }

    setIsSavingDocument(true)
    setDocumentMessage(null)
    setSavedDocumentForExport(null)
    setPdfExportError(null)
    try {
      // Keep the source report file in sync with the edited markdown before versioning it.
      await saveReportContent(selectedReportName, markdownContent)

      // One document row is created/updated per selected author x customer combo (all sharing
      // the base documentName + the same new version number).
      const nextVersion = await saveDocument({
        documentName,
        title: title.trim(),
        projectManager: projectManager.trim(),
        costumer: costumer.trim(),
        authorIds,
        costumersListIds,
        markdownContent,
      })
      const selectedAuthorNames = authors
        .filter((author) => authorIds.includes(author.id))
        .map((author) => author.name)
        .join(', ')
      setSavedDocumentForExport({
        fileName: selectedReportName,
        customer: costumer.trim(),
        description: title.trim(),
        version: nextVersion,
        author: selectedAuthorNames,
        projectManager: projectManager.trim(),
      })
      // The just-saved state becomes the new baseline, so Save disables again until the next edit.
      setBaseline({
        title: title.trim(),
        projectManager: projectManager.trim(),
        costumer: costumer.trim(),
        authorIds,
        costumersListIds,
        markdownContent,
      })
      setDocumentMessage(`Document version ${nextVersion.toFixed(1)} saved. You can now export it to PDF.`)
      // Flip the report's list indicator from "draft" to "versioned" immediately.
      setDocumentStatusByReport((previous) => {
        const next = new Map(previous)
        next.set(selectedReportName, { isVersioned: true, versionNumber: nextVersion })
        return next
      })
    } catch (saveError) {
      setDocumentMessage(saveError instanceof Error ? saveError.message : 'Could not save the document version.')
    } finally {
      setIsSavingDocument(false)
    }
  }

  async function exportSavedDocumentPdf() {
    if (!savedDocumentForExport) {
      return
    }

    setIsExportingPdf(true)
    setPdfExportError(null)
    try {
      const pdf = await fetchReportPdf(savedDocumentForExport.fileName, savedDocumentForExport)
      const downloadUrl = URL.createObjectURL(pdf)
      const downloadLink = document.createElement('a')
      downloadLink.href = downloadUrl
      downloadLink.download = savedDocumentForExport.fileName.replace(/\.md$/i, '') + '.pdf'
      document.body.appendChild(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch (exportError) {
      setPdfExportError(exportError instanceof Error ? exportError.message : 'Could not export the report as PDF.')
    } finally {
      setIsExportingPdf(false)
    }
  }

  function downloadMarkdown() {
    if (!selectedReportName) {
      return
    }

    const markdownBlob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' })
    const downloadUrl = URL.createObjectURL(markdownBlob)
    const downloadLink = document.createElement('a')
    downloadLink.href = downloadUrl
    downloadLink.download = selectedReportName
    document.body.appendChild(downloadLink)
    downloadLink.click()
    downloadLink.remove()
    URL.revokeObjectURL(downloadUrl)
  }

  function requestDeleteReport(reportName: string) {
    setDeleteReportError(null)
    setDeleteTargetReport(reportName)
  }

  async function confirmDeleteReport() {
    if (!deleteTargetReport) {
      return
    }

    const reportName = deleteTargetReport
    setIsDeletingReport(true)
    setDeleteReportError(null)
    try {
      // Only the versioned DB record needs explicit removal; the file is always deleted from disk.
      if (documentStatusByReport.get(reportName)?.isVersioned) {
        await deleteDocument(reportName.replace(/\.md$/i, ''))
      }
      await deleteReportContent(reportName)

      setDocumentStatusByReport((previous) => {
        const next = new Map(previous)
        next.delete(reportName)
        return next
      })

      if (selectedReportName === reportName) {
        await selectReport('')
      }

      setDeleteTargetReport(null)
      onRefreshReports()
    } catch (deleteError) {
      setDeleteReportError(deleteError instanceof Error ? deleteError.message : 'Could not delete the report.')
    } finally {
      setIsDeletingReport(false)
    }
  }

  async function selectReport(reportName: string) {
    const loadSequence = ++reportLoadSequence.current
    setSelectedReportName(reportName)
    setMarkdownContent('')
    setMarkdownContentError(null)
    setSavedDocumentForExport(null)
    setPdfExportError(null)
    setDocumentMessage(null)
    setBaseline(null)
    setIsPreviewOpen(false)

    if (!reportName) {
      setDocumentName('')
      setTitle('')
      setProjectManager('')
      setCostumer('')
      setAuthorIds([])
      setCostumersListIds([])
      return
    }

    // The report file name (without extension) is the document's unique identity
    // (documentName, PK/UK) and is also used as the default title.
    const derivedDocumentName = reportName.replace(/\.md$/i, '')
    setDocumentName(derivedDocumentName)
    setTitle(derivedDocumentName)
    setIsLoadingMarkdown(true)
    setIsCheckingExistingDocument(true)

    try {
      const [content, existingDocument] = await Promise.all([
        fetchReportContent(reportName),
        fetchExistingDocument(derivedDocumentName),
      ])

      if (loadSequence !== reportLoadSequence.current) {
        return
      }

      if (existingDocument) {
        setTitle(existingDocument.title || derivedDocumentName)
        setProjectManager(existingDocument.projectManager)
        setCostumer(existingDocument.costumer)
        setAuthorIds(existingDocument.authorIds)
        setCostumersListIds(existingDocument.costumersListIds)
        const loadedMarkdown = existingDocument.markdownContent || content
        setMarkdownContent(loadedMarkdown)
        setBaseline({
          title: existingDocument.title || derivedDocumentName,
          projectManager: existingDocument.projectManager,
          costumer: existingDocument.costumer,
          authorIds: existingDocument.authorIds,
          costumersListIds: existingDocument.costumersListIds,
          markdownContent: loadedMarkdown,
        })
        setDocumentMessage(
          `This document already exists (last saved version ${existingDocument.versionNumber.toFixed(1)}). `
          + 'Edit any field and save to create a new version.',
        )
      } else {
        setProjectManager('')
        setCostumer('')
        setAuthorIds([])
        setCostumersListIds([])
        setMarkdownContent(content)
      }
    } catch (loadError) {
      if (loadSequence === reportLoadSequence.current) {
        setMarkdownContentError(loadError instanceof Error ? loadError.message : 'Could not load the report content.')
      }
    } finally {
      if (loadSequence === reportLoadSequence.current) {
        setIsLoadingMarkdown(false)
        setIsCheckingExistingDocument(false)
      }
    }
  }

  const cards: Array<{ kind: Exclude<DialogKind, null>; title: string; entries: Array<{ id: string; label: string }> }> = [
    { kind: 'author', title: 'Authors', entries: authors.map((item) => ({ id: item.id, label: item.name })) },
    { kind: 'customer', title: 'Customers', entries: customers.map((item) => ({ id: item.id, label: item.name })) },
  ]

  // Save is only relevant once something differs from the last loaded/saved state.
  const isDirty = !baseline
    || baseline.title !== title.trim()
    || baseline.projectManager !== projectManager.trim()
    || baseline.costumer !== costumer.trim()
    || !sameIdSet(baseline.authorIds, authorIds)
    || !sameIdSet(baseline.costumersListIds, costumersListIds)
    || baseline.markdownContent !== markdownContent

  function renderStatusLabel(reportName: string) {
    const status = documentStatusByReport.get(reportName)
    if (status?.isVersioned) {
      return (
        <Label isCompact status="success" icon={<CheckCircleIcon />}>
          {`Versioned v${status.versionNumber.toFixed(1)}`}
        </Label>
      )
    }
    return (
      <Label isCompact status="warning" icon={<PencilAltIcon />}>
        Draft
      </Label>
    )
  }

  return <PageSection>
    {error ? <Alert isInline variant="danger" title="Document dependency error">{error}</Alert> : null}
    <div className="dependency-grid">
      {cards.map((card) => <Card key={card.kind} className="pf-v5-c-card">
        <CardHeader><div className="reports-page-heading"><Title headingLevel="h2" size="lg">{card.title}</Title><Button variant="primary" icon={<PlusIcon />} onClick={() => openDialog(card.kind)}>Add</Button></div></CardHeader>
        <CardBody>{isLoading ? <Spinner size="md" /> : card.entries.length ? <ul className="dependency-list">{(card.kind === 'author' ? authors : customers).map((person) => <li key={person.id}><span>{person.name}</span><Button variant="plain" aria-label={`Remove ${person.name}`} icon={<TrashIcon />} onClick={() => void removePerson(card.kind, person)} isDisabled={deletingPersonId !== null} isLoading={deletingPersonId === person.id} /></li>)}</ul> : <small>No records found.</small>}</CardBody>
      </Card>)}
    </div>
    <Card className="pf-v5-c-card document-control-card">
      <CardHeader>
        <div className="reports-page-heading">
          <Title headingLevel="h2" size="xl">Reports</Title>
          <Button type="button" variant="secondary" onClick={onRefreshReports} isDisabled={isLoadingReports}>
            {isLoadingReports ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {reportsError ? <Alert isInline variant="warning" title="Could not load reports">{reportsError}</Alert> : null}
        {documentMessage ? <Alert isInline variant="info" title={documentMessage} /> : null}
        <div className="reports-workspace">
          <div className="reports-list-panel">
            {isLoadingReports ? (
              <div className="assessment-tree-loading">
                <Spinner size="lg" aria-label="Loading reports" />
              </div>
            ) : null}
            {!isLoadingReports && reports.length === 0 ? <small>No reports found.</small> : null}
            {!isLoadingReports && reports.length > 0 ? (
              <Menu className="report-files-menu" aria-label="Analyzer report files">
                <MenuContent>
                  <MenuList>
                    {reports.map((report) => (
                      <MenuItem
                        key={report.name}
                        itemId={report.name}
                        isSelected={selectedReportName === report.name}
                        icon={<FileAltIcon />}
                        description={
                          <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                            {report.createdAt ? <FlexItem>{report.createdAt}</FlexItem> : null}
                            <FlexItem>{renderStatusLabel(report.name)}</FlexItem>
                          </Flex>
                        }
                        actions={
                          <Tooltip content="Delete report">
                            <Button
                              variant="plain"
                              aria-label={`Delete ${report.name}`}
                              icon={<TrashIcon />}
                              onClick={(event) => { event.stopPropagation(); requestDeleteReport(report.name) }}
                            />
                          </Tooltip>
                        }
                        onClick={() => { void selectReport(report.name) }}
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
              <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                <FlexItem>
                  <Title headingLevel="h3" size="lg">
                    {selectedReportName || 'Select a report'}
                  </Title>
                </FlexItem>
                {selectedReportName && !isLoadingMarkdown ? (
                  <FlexItem>{renderStatusLabel(selectedReportName)}</FlexItem>
                ) : null}
              </Flex>
              {selectedReportName && !isLoadingMarkdown ? (
                <div className="report-editor-actions">
                  <Button type="button" variant="secondary" icon={<EyeIcon />} onClick={() => setIsPreviewOpen(true)}>
                    View
                  </Button>
                  <Button type="button" variant="secondary" icon={<DownloadIcon />} onClick={downloadMarkdown}>
                    Download
                  </Button>
                </div>
              ) : null}
            </div>
            {deleteReportError ? (
              <Alert isInline variant="danger" title="Could not delete the report">{deleteReportError}</Alert>
            ) : null}
            {isCheckingExistingDocument ? (
              <small><Spinner size="sm" /> Checking if this document already exists...</small>
            ) : null}
            {markdownContentError ? (
              <Alert isInline variant="danger" title="Could not load the report">{markdownContentError}</Alert>
            ) : null}
            {!selectedReportName ? (
              <p className="report-editor-empty">Choose a report from the list to edit and save a document version.</p>
            ) : null}
            {isLoadingMarkdown ? (
              <div className="report-editor-loading">
                <Spinner size="lg" aria-label="Loading report" />
              </div>
            ) : null}
            {selectedReportName && !isLoadingMarkdown ? (
              <Form className="document-control-form" onSubmit={(event) => { event.preventDefault(); void submitDocument() }}>
                <FormGroup label="Document name" fieldId="document-name">
                  <TextInput id="document-name" value={documentName} isDisabled readOnlyVariant="default" />
                  <small>Unique identifier derived from the report file name; cannot be changed.</small>
                </FormGroup>
                <FormGroup label="Document title" isRequired fieldId="document-title"><TextInput id="document-title" value={title} onChange={(_event, value) => setTitle(value)} /></FormGroup>
                <FormGroup label="Project manager" isRequired fieldId="document-project-manager"><TextInput id="document-project-manager" value={projectManager} onChange={(_event, value) => setProjectManager(value)} /></FormGroup>
                <FormGroup label="Costumer" isRequired fieldId="document-costumer"><TextInput id="document-costumer" value={costumer} onChange={(_event, value) => setCostumer(value)} /></FormGroup>
                <FormGroup label="Author" isRequired fieldId="document-author">
                  <div className="namespace-selector-list" id="document-author">
                    {authors.length === 0 ? <small>No authors available.</small> : null}
                    {authors.map((author) => (
                      <Checkbox
                        key={author.id}
                        id={`document-author-${author.id}`}
                        label={author.name}
                        isChecked={authorIds.includes(author.id)}
                        onChange={(_event, checked) => toggleAuthor(author.id, checked)}
                      />
                    ))}
                  </div>
                  <small>Select one or more authors.</small>
                </FormGroup>
                <FormGroup label="Costumers list" isRequired fieldId="document-costumers-list">
                  <div className="namespace-selector-list" id="document-costumers-list">
                    {customers.length === 0 ? <small>No customers available.</small> : null}
                    {customers.map((customer) => (
                      <Checkbox
                        key={customer.id}
                        id={`document-costumers-list-${customer.id}`}
                        label={customer.name}
                        isChecked={costumersListIds.includes(customer.id)}
                        onChange={(_event, checked) => toggleCostumersListEntry(customer.id, checked)}
                      />
                    ))}
                  </div>
                  <small>Select one or more customers.</small>
                </FormGroup>
                <FormGroup className="document-control-form__markdown" label="Markdown content" isRequired fieldId="document-markdown-content">
                  <TextArea
                    id="document-markdown-content"
                    className="report-markdown-editor"
                    value={markdownContent}
                    onChange={(_event, value) => setMarkdownContent(value)}
                    resizeOrientation="vertical"
                  />
                </FormGroup>
                <small>Version number is calculated automatically by the API (0.1, 0.2, ... increasing per saved title).</small>
                <div className="document-control-form__actions">
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isSavingDocument}
                    isDisabled={isSavingDocument || isCheckingExistingDocument || !isDirty}
                  >
                    Save document version
                  </Button>
                  {savedDocumentForExport ? (
                    <Button
                      type="button"
                      variant="secondary"
                      icon={<FilePdfIcon />}
                      onClick={() => void exportSavedDocumentPdf()}
                      isLoading={isExportingPdf}
                    >
                      Export to PDF
                    </Button>
                  ) : null}
                </div>
                {pdfExportError ? <Alert isInline variant="danger" title="Could not export the report as PDF">{pdfExportError}</Alert> : null}
              </Form>
            ) : null}
          </section>
        </div>
      </CardBody>
    </Card>
    <Modal
      className="report-preview-modal"
      width="min(76rem, 94vw)"
      isOpen={isPreviewOpen}
      onClose={() => setIsPreviewOpen(false)}
    >
      <ModalHeader title={selectedReportName || 'Report preview'} labelId="report-preview-modal-title" />
      <ModalBody id="report-preview-modal-description">
        <MarkdownViewer content={markdownContent} />
      </ModalBody>
      <ModalFooter>
        <Button variant="link" onClick={() => setIsPreviewOpen(false)}>Close</Button>
      </ModalFooter>
    </Modal>
    <Modal variant={ModalVariant.medium} isOpen={dialogKind !== null} onClose={() => setDialogKind(null)}>
      <ModalHeader title={`Add ${dialogKind ?? ''}`} />
      <ModalBody><Form>
        <FormGroup label="Name" isRequired><TextInput value={name} onChange={(_event, value) => setName(value)} /></FormGroup><FormGroup label="Position"><TextInput value={position} onChange={(_event, value) => setPosition(value)} /></FormGroup><FormGroup label="Email"><TextInput value={email} onChange={(_event, value) => setEmail(value)} /></FormGroup>
      </Form></ModalBody>
      <ModalFooter><Button variant="primary" onClick={() => void submit()} isLoading={isSaving}>Save</Button><Button variant="link" onClick={() => setDialogKind(null)}>Cancel</Button></ModalFooter>
    </Modal>
    <Modal
      variant={ModalVariant.small}
      isOpen={deleteTargetReport !== null}
      onClose={() => { if (!isDeletingReport) { setDeleteTargetReport(null) } }}
    >
      <ModalHeader
        title="Do you want to perform this action?"
        titleIconVariant="danger"
        labelId="delete-report-modal-title"
      />
      <ModalBody id="delete-report-modal-description">
        This will permanently delete <strong>{deleteTargetReport}</strong>
        {documentStatusByReport.get(deleteTargetReport ?? '')?.isVersioned
          ? ', including its versioned document record, '
          : ' '}
        from disk. This action cannot be undone.
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={() => void confirmDeleteReport()} isLoading={isDeletingReport}>
          Yes, delete
        </Button>
        <Button variant="link" onClick={() => setDeleteTargetReport(null)} isDisabled={isDeletingReport}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  </PageSection>
}

export default DocumentDependenciesPage