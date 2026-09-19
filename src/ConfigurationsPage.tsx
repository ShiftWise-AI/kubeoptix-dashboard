import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
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
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
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
  deleteSystemLogo,
  fetchSystemLogoUrl,
  fetchSystemSettings,
  updateSystemSettings,
  uploadSystemLogo,
  validateLogoFile,
  type ExtractionMethod,
  type Language,
  type SettingsStatus,
  type SystemSettings,
  type SystemSettingsInput,
} from './services/settingsService'
import { CogIcon } from '@patternfly/react-icons'
import { DEFAULT_LANGUAGE, useI18n, type TranslationKey } from './i18n'

type ConfigurationsPageProps = {
  onSettingsChange: (settings: SystemSettings | null) => void
}

const LANGUAGE_OPTION_KEYS: { value: Language; labelKey: TranslationKey }[] = [
  { value: 'pt', labelKey: 'settings.languagePt' },
  { value: 'en', labelKey: 'settings.languageEn' },
  { value: 'es', labelKey: 'settings.languageEs' },
  { value: 'it', labelKey: 'settings.languageIt' },
]

const STATUS_OPTION_KEYS: { value: SettingsStatus; labelKey: TranslationKey }[] = [
  { value: 'active', labelKey: 'settings.statusActive' },
  { value: 'inactive', labelKey: 'settings.statusInactive' },
]

const EXTRACTION_METHOD_OPTION_KEYS: { value: ExtractionMethod; labelKey: TranslationKey }[] = [
  { value: 'ml', labelKey: 'settings.extractionMl' },
  { value: 'llm', labelKey: 'settings.extractionLlm' },
]

function createEmptyFormState(): SystemSettingsInput {
  return {
    language: DEFAULT_LANGUAGE,
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

function languageLabelKey(language: Language): TranslationKey {
  switch (language) {
    case 'pt':
      return 'settings.languagePt'
    case 'en':
      return 'settings.languageEn'
    case 'es':
      return 'settings.languageEs'
    case 'it':
      return 'settings.languageIt'
  }
}

function statusLabelKey(status: SettingsStatus): TranslationKey {
  return status === 'active' ? 'settings.statusActive' : 'settings.statusInactive'
}

function extractionLabelKey(method: ExtractionMethod): TranslationKey {
  return method === 'ml' ? 'settings.extractionMl' : 'settings.extractionLlm'
}

function ConfigurationsPage({ onSettingsChange }: ConfigurationsPageProps) {
  const { t, setLanguage } = useI18n()
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formState, setFormState] = useState<SystemSettingsInput>(createEmptyFormState)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [storedLogoUrl, setStoredLogoUrl] = useState<string | null>(null)
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null)
  const [pendingLogoUrl, setPendingLogoUrl] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [isRemovingLogo, setIsRemovingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void loadSettings()
  }, [])

  // Object URLs must be revoked to avoid leaking the decoded image in memory.
  useEffect(() => {
    return () => {
      if (pendingLogoUrl) {
        URL.revokeObjectURL(pendingLogoUrl)
      }
    }
  }, [pendingLogoUrl])

  useEffect(() => {
    return () => {
      if (storedLogoUrl) {
        URL.revokeObjectURL(storedLogoUrl)
      }
    }
  }, [storedLogoUrl])

  async function loadSettings() {
    setIsLoading(true)
    setLoadError(null)

    try {
      const result = await fetchSystemSettings()
      setSettings(result)
      setFormState(result ? toFormState(result) : createEmptyFormState())
      onSettingsChange(result)
      if (result) {
        setLanguage(result.language)
      }
      await refreshStoredLogo(result)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('settings.couldNotLoadDetail'))
    } finally {
      setIsLoading(false)
    }
  }

  async function refreshStoredLogo(currentSettings: SystemSettings | null) {
    replaceStoredLogoUrl(null)

    if (!currentSettings?.hasLogo) {
      return
    }

    try {
      replaceStoredLogoUrl(await fetchSystemLogoUrl())
    } catch {
      setLogoError(t('settings.couldNotLoadLogo'))
    }
  }

  function replaceStoredLogoUrl(nextUrl: string | null) {
    setStoredLogoUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl)
      }
      return nextUrl
    })
  }

  function clearPendingLogo() {
    setPendingLogoUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl)
      }
      return null
    })
    setPendingLogoFile(null)
    setLogoError(null)

    if (logoInputRef.current) {
      logoInputRef.current.value = ''
    }
  }

  function handleLogoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      clearPendingLogo()
      return
    }

    const validationError = validateLogoFile(file)

    if (validationError) {
      clearPendingLogo()
      setLogoError(
        validationError === 'unsupportedType'
          ? t('settings.logoUnsupportedType')
          : t('settings.logoTooLarge'),
      )
      return
    }

    setLogoError(null)
    setPendingLogoFile(file)
    setPendingLogoUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl)
      }
      return URL.createObjectURL(file)
    })
  }

  // The logo endpoint requires an existing settings record, so it runs after the record is saved.
  async function persistPendingLogo(savedSettings: SystemSettings): Promise<SystemSettings> {
    if (!pendingLogoFile) {
      return savedSettings
    }

    const updated = await uploadSystemLogo(pendingLogoFile)
    clearPendingLogo()
    return updated
  }

  async function handleRemoveStoredLogo() {
    setIsRemovingLogo(true)
    setLogoError(null)

    try {
      await deleteSystemLogo()
      replaceStoredLogoUrl(null)
      setSettings((previousSettings) => {
        const next = previousSettings ? { ...previousSettings, hasLogo: false } : previousSettings
        onSettingsChange(next ?? null)
        return next
      })
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : t('settings.couldNotRemoveLogo'))
    } finally {
      setIsRemovingLogo(false)
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
      const created = await persistPendingLogo(await createSystemSettings(formState))
      setSettings(created)
      setFormState(toFormState(created))
      setLanguage(created.language)
      onSettingsChange(created)
      await refreshStoredLogo(created)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('settings.couldNotSaveDetail'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUpdateSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setSaveError(null)

    try {
      const updated = await persistPendingLogo(await updateSystemSettings(formState))
      setSettings(updated)
      setFormState(toFormState(updated))
      setLanguage(updated.language)
      onSettingsChange(updated)
      await refreshStoredLogo(updated)
      setIsEditModalOpen(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('settings.couldNotUpdateDetail'))
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
    clearPendingLogo()
    setIsEditModalOpen(true)
  }

  function renderLogoField() {
    const previewUrl = pendingLogoUrl ?? storedLogoUrl

    return (
      <FormGroup label={t('settings.logo')} fieldId="settings-logo">
        <input
          id="settings-logo"
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleLogoSelected}
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={logoError ? 'error' : 'default'}>
              {logoError ?? t('settings.logoHelp')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
        {previewUrl ? (
          <div className="settings-logo-preview">
            <img src={previewUrl} alt={t('settings.logoPreviewAlt')} className="settings-logo-preview-image" />
            <div className="settings-logo-preview-actions">
              <span className="settings-logo-preview-caption">
                {pendingLogoUrl
                  ? t('settings.logoPreviewPending', { name: pendingLogoFile?.name ?? '' })
                  : t('settings.logoCurrent')}
              </span>
              {pendingLogoUrl ? (
                <Button variant="link" isInline onClick={clearPendingLogo} isDisabled={isSaving}>
                  {t('settings.logoDiscard')}
                </Button>
              ) : (
                <Button
                  variant="link"
                  isInline
                  isDanger
                  onClick={() => void handleRemoveStoredLogo()}
                  isLoading={isRemovingLogo}
                  isDisabled={isRemovingLogo || isSaving}
                >
                  {t('settings.logoRemove')}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </FormGroup>
    )
  }

  function renderFormFields() {
    return (
      <>
        <FormGroup label={t('settings.language')} isRequired fieldId="settings-language">
          <FormSelect
            id="settings-language"
            value={formState.language}
            onChange={(_event, value) => updateFormField('language', value as Language)}
          >
            {LANGUAGE_OPTION_KEYS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={t(option.labelKey)} />
            ))}
          </FormSelect>
        </FormGroup>
        <FormGroup label={t('settings.cursorApiKey')} fieldId="settings-cursor-api-key">
          <TextInput
            id="settings-cursor-api-key"
            type="password"
            value={formState.cursorApiKey}
            onChange={(_event, value) => updateFormField('cursorApiKey', value)}
          />
        </FormGroup>
        <FormGroup label={t('settings.cursorModel')} fieldId="settings-cursor-model">
          <TextInput
            id="settings-cursor-model"
            value={formState.cursorModel}
            onChange={(_event, value) => updateFormField('cursorModel', value)}
          />
        </FormGroup>
        <FormGroup label={t('settings.llmApiKey')} fieldId="settings-llm-api-key">
          <TextInput
            id="settings-llm-api-key"
            type="password"
            value={formState.llmApiKey}
            onChange={(_event, value) => updateFormField('llmApiKey', value)}
          />
        </FormGroup>
        <FormGroup label={t('settings.llmModel')} fieldId="settings-llm-model">
          <TextInput
            id="settings-llm-model"
            value={formState.llmModel}
            onChange={(_event, value) => updateFormField('llmModel', value)}
          />
        </FormGroup>
        <FormGroup label={t('settings.defaultExtractionMethod')} isRequired fieldId="settings-extraction-method">
          <FormSelect
            id="settings-extraction-method"
            value={formState.defaultExtractionMethod}
            onChange={(_event, value) => updateFormField('defaultExtractionMethod', value as ExtractionMethod)}
          >
            {EXTRACTION_METHOD_OPTION_KEYS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={t(option.labelKey)} />
            ))}
          </FormSelect>
        </FormGroup>
        <FormGroup label={t('settings.status')} isRequired fieldId="settings-status">
          <FormSelect
            id="settings-status"
            value={formState.status}
            onChange={(_event, value) => updateFormField('status', value as SettingsStatus)}
          >
            {STATUS_OPTION_KEYS.map((option) => (
              <FormSelectOption key={option.value} value={option.value} label={t(option.labelKey)} />
            ))}
          </FormSelect>
        </FormGroup>
        {renderLogoField()}
      </>
    )
  }

  if (isLoading) {
    return (
      <PageSection>
        <Spinner size="lg" aria-label={t('settings.loading')} />
      </PageSection>
    )
  }

  return (
    <PageSection>
      {loadError ? (
        <Alert isInline variant="danger" title={t('settings.couldNotLoad')}>
          {loadError}
        </Alert>
      ) : null}
      {!settings ? (
        <Card className="pf-v5-c-card">
          <CardHeader>
            <Title headingLevel="h2" size="xl"><span className="section-title"><CogIcon className="section-title-icon" />{t('settings.systemSettings')}</span></Title>
          </CardHeader>
          <CardBody>
            <Alert isInline variant="info" title={t('settings.initialRequired')}>
              {t('settings.initialRequiredBody')}
            </Alert>
            {saveError ? (
              <Alert isInline variant="danger" title={t('settings.couldNotSave')}>
                {saveError}
              </Alert>
            ) : null}
            <Form onSubmit={(event) => void handleCreateSubmit(event)}>
              {renderFormFields()}
              <div className="form-actions-right">
                <Button type="submit" variant="primary" isLoading={isSaving} isDisabled={isSaving}>
                  {t('settings.saveSettings')}
                </Button>
              </div>
            </Form>
          </CardBody>
        </Card>
      ) : (
        <Card className="pf-v5-c-card">
          <CardHeader>
            <div className="reports-page-heading">
              <Title headingLevel="h2" size="xl"><span className="section-title"><CogIcon className="section-title-icon" />{t('settings.systemSettings')}</span></Title>
              <Button type="button" variant="secondary" onClick={openEditModal}>
                {t('settings.editSettings')}
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('settings.language')}</DescriptionListTerm>
                <DescriptionListDescription>{t(languageLabelKey(settings.language))}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('settings.cursorModel')}</DescriptionListTerm>
                <DescriptionListDescription>{settings.cursorModel}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('settings.llmModel')}</DescriptionListTerm>
                <DescriptionListDescription>{settings.llmModel}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('settings.defaultExtractionMethod')}</DescriptionListTerm>
                <DescriptionListDescription>{t(extractionLabelKey(settings.defaultExtractionMethod))}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('settings.status')}</DescriptionListTerm>
                <DescriptionListDescription>{t(statusLabelKey(settings.status))}</DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('settings.logo')}</DescriptionListTerm>
                <DescriptionListDescription>
                  {storedLogoUrl ? (
                    <img src={storedLogoUrl} alt={t('settings.logoAlt')} className="settings-logo-preview-image" />
                  ) : (
                    t('settings.logoNone')
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>{t('settings.createdAt')}</DescriptionListTerm>
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
        <ModalHeader title={t('settings.editModalTitle')} labelId="edit-settings-modal-title" />
        <ModalBody id="edit-settings-modal-description">
          {saveError ? (
            <Alert isInline variant="danger" title={t('settings.couldNotUpdate')}>
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
            {t('settings.saveChanges')}
          </Button>
          <Button variant="link" onClick={() => setIsEditModalOpen(false)} isDisabled={isSaving}>
            {t('common.cancel')}
          </Button>
        </ModalFooter>
      </Modal>
    </PageSection>
  )
}

export default ConfigurationsPage
