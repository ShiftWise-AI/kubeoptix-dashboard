import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  PageSection,
  Spinner,
  TextInput,
  Title,
} from '@patternfly/react-core'
import {
  createSystemSettings,
  fetchSystemSettings,
  updateSystemSettings,
  type ExtractionMethod,
  type Language,
  type SettingsStatus,
  type SystemSettings,
  type SystemSettingsInput,
} from './services/settingsService'

type ConfigurationsPageProps = {
  onSettingsChange: (settings: SystemSettings | null) => void
}

const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
]

const STATUS_OPTIONS: { value: SettingsStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const EXTRACTION_METHOD_OPTIONS: { value: ExtractionMethod; label: string }[] = [
  { value: 'ml', label: 'Machine learning' },
  { value: 'llm', label: 'LLM' },
]

function createEmptyFormState(): SystemSettingsInput {
  return {
    language: 'en',
    cursorApiKey: '',
    cursorModel: '',
    llmApiKey: '',
    llmModel: '',
    status: 'active',
    defaultExtractionMethod: 'ml',
  }
}

function toFormState(settings: SystemSettings): SystemSettingsInput {
  return {
    language: settings.language,
    cursorApiKey: settings.cursorApiKey,
    cursorModel: settings.cursorModel,
    llmApiKey: settings.llmApiKey,
    llmModel: settings.llmModel,
    status: settings.status,
    defaultExtractionMethod: settings.defaultExtractionMethod,
  }
}

function ConfigurationsPage({ onSettingsChange }: ConfigurationsPageProps) {
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formState, setFormState] = useState<SystemSettingsInput>(createEmptyFormState)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  useEffect(() => {
    void loadSettings()
  }, [])

  async function loadSettings() {
    setIsLoading(true)
    setLoadError(null)

    try {
      const result = await fetchSystemSettings()
      setSettings(result)
      setFormState(result ? toFormState(result) : createEmptyFormState())
      onSettingsChange(result)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load system settings.')
    } finally {
      setIsLoading(false)
    }
  }

  function updateFormField<Field extends keyof SystemSettingsInput>(field: Field, value: SystemSettingsInput[Field]) {
    setFormState((previousState) => ({ ...previousState, [field]: value }))
  }

  async function handleCreateSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setSaveError(null)

    try {
      const created = await createSystemSettings(formState)
      setSettings(created)
      setFormState(toFormState(created))
      onSettingsChange(created)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save system settings.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUpdateSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setSaveError(null)

    try {
      const updated = await updateSystemSettings(formState)
      setSettings(updated)
      setFormState(toFormState(updated))
      onSettingsChange(updated)
      setIsEditModalOpen(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update system settings.')
    } finally {
      setIsSaving(false)
    }
  }

  function openEditModal() {
    if (!settings) {
      return
    }
    setFormState(toFormState(settings))
    setSaveError(null)
    setIsEditModalOpen(true)
  }

  function renderFormFields() {
    return (
      <>
        <FormGroup label="Language" isRequired fieldId="settings-language">
          <FormSelect
            id="settings-language"
            value={formState.language}
            onChange={(_event, value) => updateFormField('language', value as Language)}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={option.label} />
            ))}
          </FormSelect>
        </FormGroup>
        <FormGroup label="Cursor API key" fieldId="settings-cursor-api-key">
          <TextInput
            id="settings-cursor-api-key"
            type="password"
            value={formState.cursorApiKey}
            onChange={(_event, value) => updateFormField('cursorApiKey', value)}
          />
        </FormGroup>
        <FormGroup label="Cursor model" fieldId="settings-cursor-model">
          <TextInput
            id="settings-cursor-model"
            value={formState.cursorModel}
            onChange={(_event, value) => updateFormField('cursorModel', value)}
          />
        </FormGroup>
        <FormGroup label="LLM API key" fieldId="settings-llm-api-key">
          <TextInput
            id="settings-llm-api-key"
            type="password"
            value={formState.llmApiKey}
            onChange={(_event, value) => updateFormField('llmApiKey', value)}
          />
        </FormGroup>
        <FormGroup label="LLM model" fieldId="settings-llm-model">
          <TextInput
            id="settings-llm-model"
            value={formState.llmModel}
            onChange={(_event, value) => updateFormField('llmModel', value)}
          />
        </FormGroup>
        <FormGroup label="Default extraction method" isRequired fieldId="settings-extraction-method">
          <FormSelect
            id="settings-extraction-method"
            value={formState.defaultExtractionMethod}
            onChange={(_event, value) => updateFormField('defaultExtractionMethod', value as ExtractionMethod)}
          >
            {EXTRACTION_METHOD_OPTIONS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={option.label} />
            ))}
          </FormSelect>
        </FormGroup>
        <FormGroup label="Status" isRequired fieldId="settings-status">
          <FormSelect
            id="settings-status"
            value={formState.status}
            onChange={(_event, value) => updateFormField('status', value as SettingsStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={option.label} />
            ))}
          </FormSelect>
        </FormGroup>
      </>
    )
  }

  if (isLoading) {
    return (
      <PageSection>
        <Spinner size="lg" aria-label="Loading system settings" />
      </PageSection>
    )
  }

  return (
    <PageSection>
      {loadError ? (
        <Alert isInline variant="danger" title="Could not load system settings">
          {loadError}
        </Alert>
      ) : null}
      {!settings ? (
        <Card className="pf-v5-c-card">
          <CardHeader>
            <Title headingLevel="h2" size="xl">System settings</Title>
          </CardHeader>
          <CardBody>
            <Alert isInline variant="info" title="Initial configuration required">
              No system settings were found. Configure the system before using the other sections.
            </Alert>
            {saveError ? (
              <Alert isInline variant="danger" title="Could not save system settings">
                {saveError}
              </Alert>
            ) : null}
            <Form onSubmit={(event) => void handleCreateSubmit(event)}>
              {renderFormFields()}
              <Button type="submit" variant="primary" isLoading={isSaving} isDisabled={isSaving}>
                Save settings
              </Button>
            </Form>
          </CardBody>
        </Card>
      ) : (
        <Card className="pf-v5-c-card">
          <CardHeader>
            <div className="reports-page-heading">
              <Title headingLevel="h2" size="xl">System settings</Title>
              <Button type="button" variant="secondary" onClick={openEditModal}>
                Edit settings
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Language</DescriptionListTerm>
                <DescriptionListDescription>{settings.language}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Cursor model</DescriptionListTerm>
                <DescriptionListDescription>{settings.cursorModel}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>LLM model</DescriptionListTerm>
                <DescriptionListDescription>{settings.llmModel}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Default extraction method</DescriptionListTerm>
                <DescriptionListDescription>{settings.defaultExtractionMethod}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Status</DescriptionListTerm>
                <DescriptionListDescription>{settings.status}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Created at</DescriptionListTerm>
                <DescriptionListDescription>{settings.createdAt}</DescriptionListDescription>
              </DescriptionListGroup>
            </DescriptionList>
          </CardBody>
        </Card>
      )}
      <Modal
        variant={ModalVariant.medium}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
      >
        <ModalHeader title="Edit system settings" labelId="edit-settings-modal-title" />
        <ModalBody id="edit-settings-modal-description">
          {saveError ? (
            <Alert isInline variant="danger" title="Could not update system settings">
              {saveError}
            </Alert>
          ) : null}
          <Form id="edit-settings-form" onSubmit={(event) => void handleUpdateSubmit(event)}>
            {renderFormFields()}
          </Form>
        </ModalBody>
        <ModalFooter>
          <Button
            type="submit"
            form="edit-settings-form"
            variant="primary"
            isLoading={isSaving}
            isDisabled={isSaving}
          >
            Save changes
          </Button>
          <Button variant="link" onClick={() => setIsEditModalOpen(false)} isDisabled={isSaving}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </PageSection>
  )
}

export default ConfigurationsPage
