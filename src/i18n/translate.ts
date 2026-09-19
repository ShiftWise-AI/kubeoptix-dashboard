import type { Language } from '../services/settingsService'
import enUS from './locales/en-US'
import es from './locales/es'
import it from './locales/it'
import ptBR from './locales/pt-BR'
import {
  DEFAULT_LANGUAGE,
  DEFAULT_LOCALE,
  LANGUAGE_TO_LOCALE,
  type LocaleCode,
  type TranslationDictionary,
  type TranslationKey,
  type TranslationParams,
} from './types'

const catalogs: Record<LocaleCode, TranslationDictionary> = {
  'pt-BR': ptBR,
  'en-US': enUS,
  es,
  it,
}

const VALID_LANGUAGES = new Set<Language>(['en', 'pt', 'es', 'it'])

export function isValidLanguage(value: unknown): value is Language {
  return typeof value === 'string' && VALID_LANGUAGES.has(value as Language)
}

/** Maps an API language code to a UI locale, falling back to pt-BR. */
export function resolveLocale(language: unknown): LocaleCode {
  if (isValidLanguage(language)) {
    return LANGUAGE_TO_LOCALE[language]
  }
  return DEFAULT_LOCALE
}

export function resolveLanguage(language: unknown): Language {
  return isValidLanguage(language) ? language : DEFAULT_LANGUAGE
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) {
    return template
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = params[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

export function translate(
  locale: LocaleCode,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const primary = catalogs[locale]?.[key]
  const fallback = catalogs[DEFAULT_LOCALE][key]
  return interpolate(primary ?? fallback ?? key, params)
}

export type { LocaleCode, TranslationDictionary, TranslationKey, TranslationParams }
export {
  DEFAULT_LANGUAGE,
  DEFAULT_LOCALE,
  LANGUAGE_TO_LOCALE,
}
