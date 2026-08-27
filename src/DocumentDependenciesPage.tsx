import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, CardBody, CardHeader, Form, FormGroup, FormSelect, FormSelectOption, Modal, ModalBody, ModalFooter, ModalHeader, ModalVariant, PageSection, Spinner, TextArea, TextInput, Title } from '@patternfly/react-core'
import { PlusIcon } from '@patternfly/react-icons'
import { createPerson, deletePerson, fetchDocumentDependencies, saveDocumentVersion, type Person } from './services/documentVersionService'

type DialogKind = 'author' | 'customer' | null

export type DocumentReport = {
  name: string
}

type DocumentDependenciesPageProps = {
  reports: DocumentReport[]
  isLoadingReports: boolean
  reportsError: string | null
  fetchReportContent: (fileName: string) => Promise<string>
}

function DocumentDependenciesPage({ reports, isLoadingReports, reportsError, fetchReportContent }: DocumentDependenciesPageProps) {
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
  const [authorId, setAuthorId] = useState('')
  const [costumersListId, setCostumersListId] = useState('')
  const [versionNumber, setVersionNumber] = useState('')
  const [selectedReportName, setSelectedReportName] = useState('')
  const [markdownContent, setMarkdownContent] = useState('')
  const [isLoadingMarkdown, setIsLoadingMarkdown] = useState(false)
  const [markdownContentError, setMarkdownContentError] = useState<string | null>(null)
  const [isSavingDocument, setIsSavingDocument] = useState(false)
  const [documentMessage, setDocumentMessage] = useState<string | null>(null)
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

  function openDialog(kind: Exclude<DialogKind, null>) {
    setName(''); setPosition(''); setEmail(''); setDialogKind(kind)
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
    if (!title.trim() || !projectManager.trim() || !costumer.trim() || !authorId || !versionNumber.trim() || !selectedReportName || !markdownContent.trim()) {
      setDocumentMessage('Complete all document and version fields before saving.')
      return
    }

    setIsSavingDocument(true)
    try {
      await saveDocumentVersion({
        title: title.trim(),
        projectManager: projectManager.trim(),
        costumer: costumer.trim(),
        authorId,
        costumersListId,
        versionNumber: versionNumber.trim(),
        markdownContent,
      })
      setVersionNumber('')
      setDocumentMessage('Document version saved. It is ready for PDF generation.')
    } catch (saveError) {
      setDocumentMessage(saveError instanceof Error ? saveError.message : 'Could not save the document version.')
    } finally {
      setIsSavingDocument(false)
    }
  }

  async function selectReport(reportName: string) {
    const loadSequence = ++reportLoadSequence.current
    setSelectedReportName(reportName)
    setMarkdownContent('')
    setMarkdownContentError(null)

    if (!reportName) {
      return
    }

    setIsLoadingMarkdown(true)
    try {
      const content = await fetchReportContent(reportName)
      if (loadSequence === reportLoadSequence.current) {
        setMarkdownContent(content)
      }
    } catch (loadError) {
      if (loadSequence === reportLoadSequence.current) {
        setMarkdownContentError(loadError instanceof Error ? loadError.message : 'Could not load the report content.')
      }
    } finally {
      if (loadSequence === reportLoadSequence.current) {
        setIsLoadingMarkdown(false)
      }
    }
  }

  const cards: Array<{ kind: Exclude<DialogKind, null>; title: string; entries: Array<{ id: string; label: string }> }> = [
    { kind: 'author', title: 'Authors', entries: authors.map((item) => ({ id: item.id, label: item.name })) },
    { kind: 'customer', title: 'Customers', entries: customers.map((item) => ({ id: item.id, label: item.name })) },
  ]

  return <PageSection>
    {error ? <Alert isInline variant="danger" title="Document dependency error">{error}</Alert> : null}
    <Card className="pf-v5-c-card document-control-card">
      <CardHeader><Title headingLevel="h2" size="xl">Document control</Title></CardHeader>
      <CardBody>
        {documentMessage ? <Alert isInline variant="info" title={documentMessage} /> : null}
        <Form className="document-control-form" onSubmit={(event) => { event.preventDefault(); void submitDocument() }}>
          <FormGroup label="Report" isRequired fieldId="document-report">
            {reportsError ? <Alert isInline variant="warning" title="Could not load reports">{reportsError}</Alert> : null}
            <FormSelect id="document-report" value={selectedReportName} onChange={(_event, value) => { void selectReport(value) }} isDisabled={reports.length === 0 || isLoadingReports || isLoadingMarkdown}>
              <FormSelectOption value="" label={isLoadingReports ? 'Loading reports...' : reports.length > 0 ? 'Select a report' : 'No reports available'} isPlaceholder />
              {reports.map((report) => <FormSelectOption key={report.name} value={report.name} label={report.name} />)}
            </FormSelect>
          </FormGroup>
          <FormGroup label="Document title" isRequired fieldId="document-title"><TextInput id="document-title" value={title} onChange={(_event, value) => setTitle(value)} /></FormGroup>
          <FormGroup label="Project manager" isRequired fieldId="document-project-manager"><TextInput id="document-project-manager" value={projectManager} onChange={(_event, value) => setProjectManager(value)} /></FormGroup>
          <FormGroup label="Costumer" isRequired fieldId="document-costumer"><TextInput id="document-costumer" value={costumer} onChange={(_event, value) => setCostumer(value)} /></FormGroup>
          <FormGroup label="Author" isRequired fieldId="document-author"><FormSelect id="document-author" value={authorId} onChange={(_event, value) => setAuthorId(value)}><FormSelectOption value="" label="Select an author" isPlaceholder />{authors.map((author) => <FormSelectOption key={author.id} value={author.id} label={author.name} />)}</FormSelect></FormGroup>
          <FormGroup label="Costumers list" fieldId="document-costumers-list"><FormSelect id="document-costumers-list" value={costumersListId} onChange={(_event, value) => setCostumersListId(value)}><FormSelectOption value="" label={customers.length > 0 ? 'Select a customer (optional)' : 'No customers available'} isPlaceholder />{customers.map((customer) => <FormSelectOption key={customer.id} value={customer.id} label={customer.name} />)}</FormSelect></FormGroup>
          <FormGroup label="Version number" isRequired fieldId="document-version-number"><TextInput id="document-version-number" value={versionNumber} onChange={(_event, value) => setVersionNumber(value)} /></FormGroup>
          <FormGroup className="document-control-form__markdown" label="Markdown content" isRequired fieldId="document-markdown-content">
            {markdownContentError ? <Alert isInline variant="danger" title="Could not load report content">{markdownContentError}</Alert> : null}
            <TextArea id="document-markdown-content" value={isLoadingMarkdown ? 'Loading report content...' : markdownContent} readOnly resizeOrientation="vertical" />
          </FormGroup>
          <div className="document-control-form__actions"><Button type="submit" variant="primary" isLoading={isSavingDocument}>Save document version</Button></div>
        </Form>
      </CardBody>
    </Card>
    <div className="dependency-grid">
      {cards.map((card) => <Card key={card.kind} className="pf-v5-c-card">
        <CardHeader><div className="reports-page-heading"><Title headingLevel="h2" size="lg">{card.title}</Title><Button variant="primary" icon={<PlusIcon />} onClick={() => openDialog(card.kind)}>Add</Button></div></CardHeader>
        <CardBody>{isLoading ? <Spinner size="md" /> : card.entries.length ? <ul className="dependency-list">{(card.kind === 'author' ? authors : customers).map((person) => <li key={person.id}><span>{person.name}</span><Button variant="plain" aria-label={`Remove ${person.name}`} onClick={() => void removePerson(card.kind, person)} isDisabled={deletingPersonId !== null} isLoading={deletingPersonId === person.id}>-</Button></li>)}</ul> : <small>No records found.</small>}</CardBody>
      </Card>)}
    </div>
    <Modal variant={ModalVariant.medium} isOpen={dialogKind !== null} onClose={() => setDialogKind(null)}>
      <ModalHeader title={`Add ${dialogKind ?? ''}`} />
      <ModalBody><Form>
        <FormGroup label="Name" isRequired><TextInput value={name} onChange={(_event, value) => setName(value)} /></FormGroup><FormGroup label="Position"><TextInput value={position} onChange={(_event, value) => setPosition(value)} /></FormGroup><FormGroup label="Email"><TextInput value={email} onChange={(_event, value) => setEmail(value)} /></FormGroup>
      </Form></ModalBody>
      <ModalFooter><Button variant="primary" onClick={() => void submit()} isLoading={isSaving}>Save</Button><Button variant="link" onClick={() => setDialogKind(null)}>Cancel</Button></ModalFooter>
    </Modal>
  </PageSection>
}

export default DocumentDependenciesPage