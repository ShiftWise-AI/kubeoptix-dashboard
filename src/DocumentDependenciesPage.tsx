import { useEffect, useState } from 'react'
import { Alert, Button, Card, CardBody, CardHeader, Form, FormGroup, Modal, ModalBody, ModalFooter, ModalHeader, ModalVariant, PageSection, Spinner, TextInput, Title } from '@patternfly/react-core'
import { PlusIcon } from '@patternfly/react-icons'
import { createPerson, fetchDocumentDependencies, type Person } from './services/documentVersionService'

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

  const cards: Array<{ kind: Exclude<DialogKind, null>; title: string; entries: Array<{ id: string; label: string }> }> = [
    { kind: 'author', title: 'Authors', entries: authors.map((item) => ({ id: item.id, label: item.name })) },
    { kind: 'customer', title: 'Customers', entries: customers.map((item) => ({ id: item.id, label: item.name })) },
  ]

  return <PageSection>
    {error ? <Alert isInline variant="danger" title="Document dependency error">{error}</Alert> : null}
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