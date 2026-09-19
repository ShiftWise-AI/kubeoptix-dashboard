import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Card, CardBody, CardHeader, Checkbox, Flex, FlexItem, Form, FormGroup, Label, Menu, MenuContent, MenuItem, MenuList, Modal, ModalBody, ModalFooter, ModalHeader, ModalVariant, PageSection, Spinner, TextArea, TextInput, Title, Tooltip } from '@patternfly/react-core'
import { CheckCircleIcon, DownloadIcon, EyeIcon, FileAltIcon, FileInvoiceIcon, FilePdfIcon, PencilAltIcon, PlusIcon, TrashIcon, UserIcon, UsersIcon } from '@patternfly/react-icons'
import MarkdownViewer from './MarkdownViewer'
import {
  createPerson,
  deleteDocument,
  deletePerson,
  fetchAllDocumentBaseNames,
  fetchDocumentDependencies,
  fetchExistingDocument,
  fetchReportPdf,
  saveDocument,
  type Person,
} from './services/documentVersionService'
import { useI18n } from './i18n'

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
  description: string
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
  const { t } = useI18n()
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
  const [description, setDescription] = useState('')
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
  // Base report names already saved as documents in the database (looked up before the disk listing).
  const [dbReportBaseNames, setDbReportBaseNames] = useState<string[]>([])
  const reportLoadSequence = useRef(0)

  async function loadDbReportBaseNames() {
    try {
      setDbReportBaseNames(await fetchAllDocumentBaseNames())
    } catch {
      setDbReportBaseNames([])
    }
  }

  // The reports list is resolved DB-first: every document already saved in the database is shown
  // even if its source file was removed from disk, then the disk listing fills in the rest (drafts).
  const mergedReports = useMemo(() => {
    const reportsByName = new Map<string, DocumentReport>()
    for (const baseName of dbReportBaseNames) {
      const name = `${baseName}.md`
      reportsByName.set(name, { name, createdAt: null })
    }
    for (const report of reports) {
      reportsByName.set(report.name, { name: report.name, createdAt: report.createdAt ?? reportsByName.get(report.name)?.createdAt ?? null })
    }
    return Array.from(reportsByName.values()).sort((left, right) => left.name.localeCompare(right.name))
  }, [dbReportBaseNames, reports])

  async function loadDependencies() {
    setIsLoading(true)
    try {
      const dependencies = await fetchDocumentDependencies()
      setAuthors(dependencies.authors)
      setCustomers(dependencies.customers)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('reports.couldNotLoadDependencies'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadDependencies() }, [])
  useEffect(() => { void loadDbReportBaseNames() }, [])

  // Keep the selection consistent if the report list changes (e.g. after "Delete all").
  useEffect(() => {
    if (selectedReportName && !mergedReports.some((report) => report.name === selectedReportName)) {
      void selectReport('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedReports])

  // Determine, for every listed report, whether it is still a draft (no saved version yet)
  // or already versioned, so the list can render a visual indicator per item.
  useEffect(() => {
    let cancelled = false

    async function loadStatuses() {
      const statusEntries = await Promise.all(mergedReports.map(async (report) => {
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
  }, [mergedReports])

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
      setError(saveError instanceof Error ? saveError.message : t('reports.couldNotSaveDependency'))
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
        : t(kind === 'author' ? 'reports.couldNotRemoveAuthor' : 'reports.couldNotRemoveCustomer'))
    } finally {
      setDeletingPersonId(null)
    }
  }

  async function submitDocument() {
    if (!title.trim() || !description.trim() || !projectManager.trim() || !costumer.trim() || authorIds.length === 0 || costumersListIds.length === 0 || !selectedReportName || !markdownContent.trim()) {
      setDocumentMessage(t('reports.completeFields'))
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
        description: description.trim(),
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
        description: description.trim(),
        version: nextVersion,
        author: selectedAuthorNames,
        projectManager: projectManager.trim(),
      })
      // The just-saved state becomes the new baseline, so Save disables again until the next edit.
      setBaseline({
        title: title.trim(),
        description: description.trim(),
        projectManager: projectManager.trim(),
        costumer: costumer.trim(),
        authorIds,
        costumersListIds,
        markdownContent,
      })
      setDocumentMessage(t('reports.versionSaved', { version: nextVersion.toFixed(1) }))
      // Flip the report's list indicator from "draft" to "versioned" immediately.
      setDocumentStatusByReport((previous) => {
        const next = new Map(previous)
        next.set(selectedReportName, { isVersioned: true, versionNumber: nextVersion })
        return next
      })
      // Once the content is versioned in the database, the raw file on disk is no longer needed.
      try {
        await deleteReportContent(selectedReportName)
      } catch (deleteError) {
        // Non-fatal: the document is already versioned even if the disk copy could not be removed.
        console.warn('Could not delete report file from disk after versioning:', deleteError)
      }
      await loadDbReportBaseNames()
      onRefreshReports()
    } catch (saveError) {
      setDocumentMessage(saveError instanceof Error ? saveError.message : t('reports.couldNotSaveVersion'))
    } finally {
      setIsSavingDocument(false)
    }
  }

  // The report file may already be gone from disk after versioning, so the current markdown
  // content (from the DB / editor state) is submitted directly; the file name is the only key.
  async function exportSavedDocumentPdf() {
    if (!savedDocumentForExport) {
      return
    }

    setIsExportingPdf(true)
    setPdfExportError(null)
    try {
      const pdfBlob = await fetchReportPdf(
        savedDocumentForExport.fileName,
        markdownContent,
        savedDocumentForExport.version,
      )
      const downloadUrl = URL.createObjectURL(pdfBlob)
      const downloadLink = document.createElement('a')
      downloadLink.href = downloadUrl
      downloadLink.download = savedDocumentForExport.fileName.replace(/\.md$/i, '.pdf')
      document.body.appendChild(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch (exportError) {
      setPdfExportError(exportError instanceof Error ? exportError.message : t('reports.couldNotExportPdf'))
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
      // Both APIs are always triggered: removing the DB document (no-op if never versioned)
      // and removing the raw file from disk.
      await deleteDocument(reportName.replace(/\.md$/i, ''))
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
      await loadDbReportBaseNames()
      onRefreshReports()
    } catch (deleteError) {
      setDeleteReportError(deleteError instanceof Error ? deleteError.message : t('reports.couldNotDelete'))
    } finally {
      setIsDeletingReport(false)
    }
  }

  async function handleReportSelection(reportName: string) {
    if (!selectedReportName || reportName === selectedReportName) {
      await selectReport(reportName)
      return
    }

    if (!isDirty) {
      await selectReport(reportName)
      return
    }

    if (window.confirm(t('reports.switchReportWarning'))) {
      await selectReport(reportName)
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
      setDescription('')
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
    setDescription('')
    setIsLoadingMarkdown(true)
    setIsCheckingExistingDocument(true)

    try {
      // The raw file may already have been removed from disk once a document is versioned
      // (see submitDocument), so a content fetch failure alone should not be treated as fatal.
      const [content, existingDocument] = await Promise.all([
        fetchReportContent(reportName).catch(() => null),
        fetchExistingDocument(derivedDocumentName),
      ])

      if (loadSequence !== reportLoadSequence.current) {
        return
      }

      if (existingDocument) {
        setTitle(existingDocument.title || derivedDocumentName)
        setDescription(existingDocument.description)
        setProjectManager(existingDocument.projectManager)
        setCostumer(existingDocument.costumer)
        setAuthorIds(existingDocument.authorIds)
        setCostumersListIds(existingDocument.costumersListIds)
        const loadedMarkdown = existingDocument.markdownContent || content || ''
        setMarkdownContent(loadedMarkdown)
        setBaseline({
          title: existingDocument.title || derivedDocumentName,
          description: existingDocument.description,
          projectManager: existingDocument.projectManager,
          costumer: existingDocument.costumer,
          authorIds: existingDocument.authorIds,
          costumersListIds: existingDocument.costumersListIds,
          markdownContent: loadedMarkdown,
        })
        // Already-saved documents can be exported right away, without requiring a fresh save.
        setSavedDocumentForExport({
          fileName: reportName,
          customer: existingDocument.costumer,
          description: existingDocument.description || existingDocument.title || derivedDocumentName,
          version: existingDocument.versionNumber,
          author: authors
            .filter((author) => existingDocument.authorIds.includes(author.id))
            .map((author) => author.name)
            .join(', '),
          projectManager: existingDocument.projectManager,
        })
        setDocumentMessage(
          t('reports.documentExists', { version: existingDocument.versionNumber.toFixed(1) }),
        )
      } else if (content === null) {
        throw new Error(t('reports.couldNotLoadContent'))
      } else {
        setProjectManager('')
        setCostumer('')
        setAuthorIds([])
        setCostumersListIds([])
        setMarkdownContent(content)
      }
    } catch (loadError) {
      if (loadSequence === reportLoadSequence.current) {
        setMarkdownContentError(loadError instanceof Error ? loadError.message : t('reports.couldNotLoadContent'))
      }
    } finally {
      if (loadSequence === reportLoadSequence.current) {
        setIsLoadingMarkdown(false)
        setIsCheckingExistingDocument(false)
      }
    }
  }

  const selectedAuthorCount = authors.filter((author) => authorIds.includes(author.id)).length
  const selectedCustomerCount = customers.filter((customer) => costumersListIds.includes(customer.id)).length

  const cards: Array<{ kind: Exclude<DialogKind, null>; title: string; icon: ReactNode; entries: Array<{ id: string; label: string }> }> = [
    { kind: 'author', title: t('reports.authors'), icon: <UserIcon className="section-title-icon" />, entries: authors.map((item) => ({ id: item.id, label: item.name })) },
    { kind: 'customer', title: t('reports.customers'), icon: <UsersIcon className="section-title-icon" />, entries: customers.map((item) => ({ id: item.id, label: item.name })) },
  ]

  // Save is only relevant once something differs from the last loaded/saved state.
  const isDirty = !baseline
    || baseline.title !== title.trim()
    || baseline.description !== description.trim()
    || baseline.projectManager !== projectManager.trim()
    || baseline.costumer !== costumer.trim()
    || !sameIdSet(baseline.authorIds, authorIds)
    || !sameIdSet(baseline.costumersListIds, costumersListIds)
    || baseline.markdownContent !== markdownContent

  const documentStatusTitle = selectedReportName
    ? (documentStatusByReport.get(selectedReportName)?.isVersioned
      ? t('reports.versioned', { version: (documentStatusByReport.get(selectedReportName)?.versionNumber ?? 0).toFixed(1) })
      : isDirty
        ? t('reports.pendingChanges')
        : t('reports.draft'))
    : null

  const documentStatusVariant: 'success' | 'warning' | 'info' = selectedReportName
    ? (documentStatusByReport.get(selectedReportName)?.isVersioned
      ? 'success'
      : isDirty
        ? 'warning'
        : 'info')
    : 'info'

  function renderStatusLabel(reportName: string) {
    const status = documentStatusByReport.get(reportName)
    if (status?.isVersioned) {
      return (
        <Label isCompact status="success" icon={<CheckCircleIcon />}>
          {t('reports.versioned', { version: status.versionNumber.toFixed(1) })}
        </Label>
      )
    }
    return (
      <Label isCompact status="warning" icon={<PencilAltIcon />}>
        {t('reports.draft')}
      </Label>
    )
  }

  return <PageSection>
    {error ? <Alert isInline variant="danger" title={t('reports.dependencyError')}>{error}</Alert> : null}
    <div className="dependency-grid">
      {cards.map((card) => {
        const selectedCount = card.kind === 'author' ? selectedAuthorCount : selectedCustomerCount
        const emptyMessage = card.kind === 'author' ? t('reports.noAuthors') : t('reports.noCustomers')
        const selectionHint = card.kind === 'author' ? t('reports.selectAuthors') : t('reports.selectCustomers')

        return (
          <Card key={card.kind} className="pf-v5-c-card dependency-card" isCompact>
            <CardHeader>
              <div className="reports-page-heading">
                <Title headingLevel="h2" size="lg"><span className="section-title">{card.icon}{card.title}</span></Title>
                <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
                  <FlexItem>
                    <Label color={selectedCount > 0 ? 'blue' : 'grey'} isCompact>
                      {t('common.selected')}: {selectedCount}
                    </Label>
                  </FlexItem>
                  <Button variant="primary" icon={<PlusIcon />} onClick={() => openDialog(card.kind)}>{t('reports.add')}</Button>
                </Flex>
              </div>
            </CardHeader>
            <CardBody>
              {isLoading ? <Spinner size="md" /> : card.entries.length ? (
                <>
                  <small>{selectionHint}</small>
                  <ul className="dependency-list">{(card.kind === 'author' ? authors : customers).map((person) => <li key={person.id}><span>{person.name}</span><Button variant="plain" aria-label={t('reports.removePerson', { name: person.name })} icon={<TrashIcon />} onClick={() => void removePerson(card.kind, person)} isDisabled={deletingPersonId !== null} isLoading={deletingPersonId === person.id} /></li>)}</ul>
                </>
              ) : <small>{emptyMessage}</small>}
            </CardBody>
          </Card>
        )
      })}
    </div>
    <Card className="pf-v5-c-card document-control-card">
      <CardHeader>
        <div className="reports-page-heading">
          <Title headingLevel="h2" size="xl"><span className="section-title"><FileInvoiceIcon className="section-title-icon" />{t('reports.title')}</span></Title>
          <Button type="button" variant="secondary" onClick={onRefreshReports} isDisabled={isLoadingReports}>
            {isLoadingReports ? t('common.refreshing') : t('common.refresh')}
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {reportsError ? <Alert isInline variant="warning" title={t('reports.couldNotLoadReports')}>{reportsError}</Alert> : null}
        {documentMessage ? <Alert isInline variant="info" title={documentMessage} /> : null}
        {selectedReportName && !isLoadingMarkdown && isDirty ? (
          <Alert isInline variant="warning" title={t('reports.pendingChanges')}>
            {t('reports.pendingChangesBody')}
          </Alert>
        ) : null}
        <div className="reports-workspace">
          <div className="reports-list-panel">
            {isLoadingReports ? (
              <div className="assessment-tree-loading">
                <Spinner size="lg" aria-label={t('reports.loadingReports')} />
              </div>
            ) : null}
            {!isLoadingReports && mergedReports.length === 0 ? <small>{t('reports.noReports')}</small> : null}
            {!isLoadingReports && mergedReports.length > 0 ? (
              <Menu className="report-files-menu" aria-label={t('reports.reportFiles')}>
                <MenuContent>
                  <MenuList>
                    {mergedReports.map((report) => (
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
                          <Tooltip content={t('reports.deleteReport')}>
                            <Button
                              variant="plain"
                              aria-label={`${t('reports.deleteReport')} ${report.name}`}
                              icon={<TrashIcon />}
                              onClick={(event) => { event.stopPropagation(); requestDeleteReport(report.name) }}
                            />
                          </Tooltip>
                        }
                        onClick={() => { void handleReportSelection(report.name) }}
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
                    {selectedReportName || t('reports.selectReport')}
                  </Title>
                </FlexItem>
                {selectedReportName && !isLoadingMarkdown ? (
                  <FlexItem>{renderStatusLabel(selectedReportName)}</FlexItem>
                ) : null}
              </Flex>
              {selectedReportName && !isLoadingMarkdown ? (
                <div className="report-editor-actions">
                  <Button type="button" variant="secondary" icon={<EyeIcon />} onClick={() => setIsPreviewOpen(true)}>
                    {t('reports.preview')}
                  </Button>
                  <Button type="button" variant="secondary" icon={<DownloadIcon />} onClick={downloadMarkdown}>
                    {t('reports.download')}
                  </Button>
                </div>
              ) : null}
            </div>
            {deleteReportError ? (
              <Alert isInline variant="danger" title={t('reports.couldNotDeleteTitle')}>{deleteReportError}</Alert>
            ) : null}
            {markdownContentError ? (
              <Alert isInline variant="danger" title={t('reports.couldNotLoadTitle')}>{markdownContentError}</Alert>
            ) : null}
            {!selectedReportName && !isLoadingMarkdown ? (
              <p className="report-editor-empty">{t('reports.chooseReport')}</p>
            ) : null}
            {selectedReportName && !isLoadingMarkdown && (authors.length === 0 || customers.length === 0) ? (
              <Alert isInline variant="info" title={t('reports.selectAuthors')}>
                {authors.length === 0 ? <p>{t('reports.noAuthors')}</p> : null}
                {customers.length === 0 ? <p>{t('reports.noCustomers')}</p> : null}
              </Alert>
            ) : null}
            {isLoadingMarkdown ? (
              <div className="report-editor-loading">
                <Spinner size="lg" aria-label={t('reports.loadingReport')} />
              </div>
            ) : null}
            {selectedReportName && !isLoadingMarkdown ? (
              <Form className="document-control-form" onSubmit={(event) => { event.preventDefault(); void submitDocument() }}>
                <Alert isInline variant={documentStatusVariant} title={documentStatusTitle ?? t('reports.selectReport')}>
                  {documentStatusByReport.get(selectedReportName)?.isVersioned
                    ? t('reports.documentExists', { version: (documentStatusByReport.get(selectedReportName)?.versionNumber ?? 0).toFixed(1) })
                    : isDirty
                      ? t('reports.pendingChangesBody')
                      : t('reports.versionHelp')}
                </Alert>
                <FormGroup label={t('reports.documentName')} fieldId="document-name">
                  <TextInput id="document-name" value={documentName} isDisabled readOnlyVariant="default" />
                  <small>{t('reports.documentNameHelp')}</small>
                </FormGroup>
                <FormGroup label={t('reports.documentTitle')} isRequired fieldId="document-title"><TextInput id="document-title" value={title} onChange={(_event, value) => setTitle(value)} /></FormGroup>
                <FormGroup label={t('reports.description')} isRequired fieldId="document-description"><TextInput id="document-description" value={description} onChange={(_event, value) => setDescription(value)} /></FormGroup>
                <FormGroup label={t('reports.projectManager')} isRequired fieldId="document-project-manager"><TextInput id="document-project-manager" value={projectManager} onChange={(_event, value) => setProjectManager(value)} /></FormGroup>
                <FormGroup label={t('reports.costumer')} isRequired fieldId="document-costumer"><TextInput id="document-costumer" value={costumer} onChange={(_event, value) => setCostumer(value)} /></FormGroup>
                <FormGroup label={t('reports.author')} isRequired fieldId="document-author">
                  <div className="namespace-selector-list" id="document-author">
                    {authors.length === 0 ? <small>{t('reports.noAuthors')}</small> : null}
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
                  <small>{t('reports.selectAuthors')}</small>
                </FormGroup>
                <FormGroup label={t('reports.costumersList')} isRequired fieldId="document-costumers-list">
                  <div className="namespace-selector-list" id="document-costumers-list">
                    {customers.length === 0 ? <small>{t('reports.noCustomers')}</small> : null}
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
                  <small>{t('reports.selectCustomers')}</small>
                </FormGroup>
                <FormGroup className="document-control-form__markdown" label={t('reports.markdownContent')} isRequired fieldId="document-markdown-content">
                  <TextArea
                    id="document-markdown-content"
                    className="report-markdown-editor"
                    value={markdownContent}
                    resizeOrientation="vertical"
                    autoResize
                    onChange={(_event, value) => setMarkdownContent(value)}
                  />
                </FormGroup>
                <small>{t('reports.versionHelp')}</small>
                <div className="document-control-form__actions">
                  <Button
                    type="submit"
                    variant={isDirty ? 'primary' : 'secondary'}
                    isLoading={isSavingDocument}
                    isDisabled={isSavingDocument || isCheckingExistingDocument || !isDirty}
                  >
                    {t('reports.saveDocument')}
                  </Button>
                  {savedDocumentForExport ? (
                    <Button
                      type="button"
                      variant="secondary"
                      icon={<FilePdfIcon />}
                      onClick={() => void exportSavedDocumentPdf()}
                      isLoading={isExportingPdf}
                    >
                      {t('reports.exportPdf')}
                    </Button>
                  ) : null}
                </div>
                {pdfExportError ? <Alert isInline variant="danger" title={t('reports.couldNotExportTitle')}>{pdfExportError}</Alert> : null}
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
      <ModalHeader title={selectedReportName || t('reports.reportPreview')} labelId="report-preview-modal-title" />
      <ModalBody id="report-preview-modal-description">
        <MarkdownViewer content={markdownContent} />
      </ModalBody>
      <ModalFooter>
        <Button variant="link" onClick={() => setIsPreviewOpen(false)}>{t('common.close')}</Button>
      </ModalFooter>
    </Modal>
    <Modal variant={ModalVariant.medium} isOpen={dialogKind !== null} onClose={() => setDialogKind(null)}>
      <ModalHeader title={dialogKind === 'author' ? t('reports.addAuthor') : dialogKind === 'customer' ? t('reports.addCustomer') : ''} />
      <ModalBody><Form>
        <FormGroup label={t('common.name')} isRequired><TextInput value={name} onChange={(_event, value) => setName(value)} /></FormGroup><FormGroup label={t('common.position')}><TextInput value={position} onChange={(_event, value) => setPosition(value)} /></FormGroup><FormGroup label={t('common.email')}><TextInput value={email} onChange={(_event, value) => setEmail(value)} /></FormGroup>
      </Form></ModalBody>
      <ModalFooter><Button variant="primary" onClick={() => void submit()} isLoading={isSaving}>{t('common.save')}</Button><Button variant="link" onClick={() => setDialogKind(null)}>{t('common.cancel')}</Button></ModalFooter>
    </Modal>
    <Modal
      variant={ModalVariant.small}
      isOpen={deleteTargetReport !== null}
      onClose={() => { if (!isDeletingReport) { setDeleteTargetReport(null) } }}
    >
      <ModalHeader
        title={t('common.confirmActionTitle')}
        titleIconVariant="danger"
        labelId="delete-report-modal-title"
      />
      <ModalBody id="delete-report-modal-description">
        {t('reports.deleteModalBefore')}{' '}
        <strong>{deleteTargetReport}</strong>
        {documentStatusByReport.get(deleteTargetReport ?? '')?.isVersioned
          ? t('reports.deleteModalAfterVersioned')
          : t('reports.deleteModalAfterPlain')}
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" onClick={() => void confirmDeleteReport()} isLoading={isDeletingReport}>
          {t('common.yesDelete')}
        </Button>
        <Button variant="link" onClick={() => setDeleteTargetReport(null)} isDisabled={isDeletingReport}>
          {t('common.cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  </PageSection>

}

export default DocumentDependenciesPage