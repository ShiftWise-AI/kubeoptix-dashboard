import type { Language } from '../services/settingsService'

/** Locale catalogs used by the UI. Same BCP 47 tags accepted by the API. */
export type LocaleCode = 'pt-BR' | 'en-US' | 'es-ES' | 'it-IT'

export type TranslationParams = Record<string, string | number>

export type TranslationDictionary = {
  // Common
  'common.cancel': string
  'common.close': string
  'common.save': string
  'common.refresh': string
  'common.refreshing': string
  'common.run': string
  'common.yesRun': string
  'common.yesDelete': string
  'common.completed': string
  'common.selected': string
  'common.add': string
  'common.name': string
  'common.position': string
  'common.email': string
  'common.unknownRequestError': string
  'common.confirmActionTitle': string

  // Navigation / chrome
  'nav.serviceSections': string
  'nav.harvester': string
  'nav.analyzer': string
  'nav.reports': string
  'nav.configurations': string
  'app.logoAlt': string
  'app.description': string
  'theme.dark': string
  'theme.system': string
  'workflow.progress': string
  'workflow.collectData': string
  'workflow.collectHint': string
  'workflow.analyze': string
  'workflow.analyzeHint': string
  'workflow.reviewReports': string
  'workflow.viewGeneratedReports': string
  'workflow.reportsAvailable': string

  // Harvester
  'harvester.title': string
  'harvester.startCollection': string
  'harvester.viewFiles': string
  'harvester.namespaces': string
  'harvester.filterNamespaces': string
  'harvester.selectFiltered': string
  'harvester.clearAll': string
  'harvester.noNamespaces': string
  'harvester.deleteAll': string
  'harvester.collectionProgress': string
  'harvester.collecting': string
  'harvester.collectionCompleted': string
  'harvester.collectionCompletedContinue': string
  'harvester.statusRetry': string
  'harvester.deleteModalBody': string
  'harvester.assessmentFiles': string
  'harvester.loadingAssessmentFiles': string
  'harvester.assessmentTree': string
  'harvester.couldNotUpdateFileList': string
  'harvester.couldNotLoadNamespaces': string
  'harvester.noNamespacesReturned': string
  'harvester.couldNotRetrieveStatus': string
  'harvester.couldNotLoadAssessmentFiles': string
  'harvester.collectionAlreadyRunning': string
  'harvester.invalidProgress': string
  'harvester.invalidFileTree': string
  'harvester.invalidFileTreeNode': string

  // Analyzer
  'analyzer.title': string
  'analyzer.runAnalyzer': string
  'analyzer.viewReports': string
  'analyzer.noAssessmentData': string
  'analyzer.goToHarvester': string
  'analyzer.runCollectionFirst': string
  'analyzer.namespaces': string
  'analyzer.filterNamespaces': string
  'analyzer.selectFiltered': string
  'analyzer.clearAll': string
  'analyzer.noNamespaces': string
  'analyzer.mode': string
  'analyzer.modeMl': string
  'analyzer.modeLlm': string
  'analyzer.progress': string
  'analyzer.analyzing': string
  'analyzer.analysisCompleted': string
  'analyzer.analysisCompletedOpenReports': string
  'analyzer.statusRetry': string
  'analyzer.predictiveStatusRetry': string
  'analyzer.couldNotLoadNamespaces': string
  'analyzer.couldNotLoadReports': string
  'analyzer.couldNotRetrieveStatus': string
  'analyzer.couldNotRetrievePredictiveStatus': string
  'analyzer.missingExecutionId': string

  // Configurations
  'settings.systemSettings': string
  'settings.loading': string
  'settings.couldNotLoad': string
  'settings.couldNotLoadDetail': string
  'settings.initialRequired': string
  'settings.initialRequiredBody': string
  'settings.initialChecklistTitle': string
  'settings.initialChecklistLanguage': string
  'settings.initialChecklistIntegrations': string
  'settings.initialChecklistWorkflow': string
  'settings.initialChecklistBranding': string
  'settings.couldNotSave': string
  'settings.couldNotSaveDetail': string
  'settings.couldNotUpdate': string
  'settings.couldNotUpdateDetail': string
  'settings.saveSettings': string
  'settings.editSettings': string
  'settings.editModalTitle': string
  'settings.saveChanges': string
  'settings.language': string
  'settings.cursorApiKey': string
  'settings.cursorModel': string
  'settings.llmApiKey': string
  'settings.llmModel': string
  'settings.defaultExtractionMethod': string
  'settings.status': string
  'settings.statusActive': string
  'settings.statusInactive': string
  'settings.extractionMl': string
  'settings.extractionLlm': string
  'settings.logo': string
  'settings.logoHelp': string
  'settings.logoPreviewAlt': string
  'settings.logoAlt': string
  'settings.logoPreviewPending': string
  'settings.logoCurrent': string
  'settings.logoDiscard': string
  'settings.logoRemove': string
  'settings.logoNone': string
  'settings.createdAt': string
  'settings.couldNotLoadLogo': string
  'settings.couldNotRemoveLogo': string
  'settings.logoUnsupportedType': string
  'settings.logoTooLarge': string
  'settings.languageEn': string
  'settings.languagePt': string
  'settings.languageEs': string
  'settings.languageIt': string

  // Reports / document dependencies
  'reports.title': string
  'reports.authors': string
  'reports.customers': string
  'reports.add': string
  'reports.noRecords': string
  'reports.removePerson': string
  'reports.couldNotLoadDependencies': string
  'reports.couldNotSaveDependency': string
  'reports.couldNotRemoveAuthor': string
  'reports.couldNotRemoveCustomer': string
  'reports.completeFields': string
  'reports.pendingChanges': string
  'reports.pendingChangesBody': string
  'reports.switchReportWarning': string
  'reports.versionSaved': string
  'reports.couldNotSaveVersion': string
  'reports.couldNotExportPdf': string
  'reports.couldNotDelete': string
  'reports.documentExists': string
  'reports.couldNotLoadContent': string
  'reports.dependencyError': string
  'reports.couldNotLoadReports': string
  'reports.loadingReports': string
  'reports.noReports': string
  'reports.reportFiles': string
  'reports.deleteReport': string
  'reports.selectReport': string
  'reports.preview': string
  'reports.download': string
  'reports.couldNotDeleteTitle': string
  'reports.couldNotLoadTitle': string
  'reports.chooseReport': string
  'reports.loadingReport': string
  'reports.documentName': string
  'reports.documentNameHelp': string
  'reports.documentTitle': string
  'reports.description': string
  'reports.projectManager': string
  'reports.costumer': string
  'reports.author': string
  'reports.noAuthors': string
  'reports.selectAuthors': string
  'reports.costumersList': string
  'reports.noCustomers': string
  'reports.selectCustomers': string
  'reports.markdownContent': string
  'reports.versionHelp': string
  'reports.saveDocument': string
  'reports.exportPdf': string
  'reports.couldNotExportTitle': string
  'reports.reportPreview': string
  'reports.addAuthor': string
  'reports.addCustomer': string
  'reports.draft': string
  'reports.versioned': string
  'reports.deleteModalBefore': string
  'reports.deleteModalAfterVersioned': string
  'reports.deleteModalAfterPlain': string
}

export type TranslationKey = keyof TranslationDictionary

export const DEFAULT_LANGUAGE: Language = 'pt-BR'
export const DEFAULT_LOCALE: LocaleCode = 'pt-BR'

// Language and LocaleCode share the same BCP 47 tags, so these maps are identities
// kept for clarity at the call sites (API language <-> UI locale catalog).
export const LANGUAGE_TO_LOCALE: Record<Language, LocaleCode> = {
  'pt-BR': 'pt-BR',
  'en-US': 'en-US',
  'es-ES': 'es-ES',
  'it-IT': 'it-IT',
}

export const LOCALE_TO_LANGUAGE: Record<LocaleCode, Language> = {
  'pt-BR': 'pt-BR',
  'en-US': 'en-US',
  'es-ES': 'es-ES',
  'it-IT': 'it-IT',
}
