import { useEffect, useState } from 'react'
import { Alert, Button, Card, CardBody, CardHeader, Form, FormGroup, FormSelect, FormSelectOption, Modal, ModalBody, ModalFooter, ModalHeader, ModalVariant, PageSection, Spinner, TextArea, TextInput, Title } from '@patternfly/react-core'
import { PlusIcon } from '@patternfly/react-icons'
import { createPerson, fetchDocumentDependencies, saveDocumentVersion, type Person } from './services/documentVersionService'

type DialogKind = 'author' | 'customer' | null

function DocumentDependenciesPage() {
  const [authors, setAuthors] = useState<Person[]>([])
  const [customers, setCustomers] = useState<Person[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogKind, setDialogKind] = useState<DialogKind>(null)
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [email, setEmail] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [projectManager, setProjectManager] = useState('')
  const [costumer, setCostumer] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [costumersListId, setCostumersListId] = useState('')
  const [versionNumber, setVersionNumber] = useState('')
  const [markdownContent, setMarkdownContent] = useState('')
  const [isSavingDocument, setIsSavingDocument] = useState(false)
  const [documentMessage, setDocumentMessage] = useState<string | null>(null)

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

  async function submitDocument() {
    if (!title.trim() || !projectManager.trim() || !costumer.trim() || !authorId || !costumersListId || !versionNumber.trim() || !markdownContent.trim()) {
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
      setMarkdownContent('')
      setDocumentMessage('Document version saved. It is ready for PDF generation.')
    } catch (saveError) {
      setDocumentMessage(saveError instanceof Error ? saveError.message : 'Could not save the document version.')
    } finally {
      setIsSavingDocument(false)
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
          <FormGroup label="Document title" isRequired fieldId="document-title"><TextInput id="document-title" value={title} onChange={(_event, value) => setTitle(value)} /></FormGroup>
          <FormGroup label="Project manager" isRequired fieldId="document-project-manager"><TextInput id="document-project-manager" value={projectManager} onChange={(_event, value) => setProjectManager(value)} /></FormGroup>
          <FormGroup label="Costumer" isRequired fieldId="document-costumer"><TextInput id="document-costumer" value={costumer} onChange={(_event, value) => setCostumer(value)} /></FormGroup>
          <FormGroup label="Author" isRequired fieldId="document-author"><FormSelect id="document-author" value={authorId} onChange={(_event, value) => setAuthorId(value)}><FormSelectOption value="" label="Select an author" isPlaceholder />{authors.map((author) => <FormSelectOption key={author.id} value={author.id} label={author.name} />)}</FormSelect></FormGroup>
          <FormGroup label="Costumers list" isRequired fieldId="document-costumers-list"><FormSelect id="document-costumers-list" value={costumersListId} onChange={(_event, value) => setCostumersListId(value)}><FormSelectOption value="" label="Select a customer" isPlaceholder />{customers.map((customer) => <FormSelectOption key={customer.id} value={customer.id} label={customer.name} />)}</FormSelect></FormGroup>
          <FormGroup label="Version number" isRequired fieldId="document-version-number"><TextInput id="document-version-number" value={versionNumber} onChange={(_event, value) => setVersionNumber(value)} /></FormGroup>
          <FormGroup className="document-control-form__markdown" label="Markdown content" isRequired fieldId="document-markdown-content"><TextArea id="document-markdown-content" value={markdownContent} onChange={(_event, value) => setMarkdownContent(value)} resizeOrientation="vertical" /></FormGroup>
          <div className="document-control-form__actions"><Button type="submit" variant="primary" isLoading={isSavingDocument}>Save document version</Button></div>
        </Form>
      </CardBody>
    </Card>
    <div className="dependency-grid">
      {cards.map((card) => <Card key={card.kind} className="pf-v5-c-card">
        <CardHeader><div className="reports-page-heading"><Title headingLevel="h2" size="lg">{card.title}</Title><Button variant="primary" icon={<PlusIcon />} onClick={() => openDialog(card.kind)}>Add</Button></div></CardHeader>
        <CardBody>{isLoading ? <Spinner size="md" /> : card.entries.length ? <ul className="dependency-list">{card.entries.map((entry) => <li key={entry.id}>{entry.label}</li>)}</ul> : <small>No records found.</small>}</CardBody>
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