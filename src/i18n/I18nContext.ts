import { createContext } from 'react'
import type { Language } from '../services/settingsService'
import type { LocaleCode, TranslationKey, TranslationParams } from './types'

export type I18nContextValue = {
  language: Language
  locale: LocaleCode
  setLanguage: (language: Language | string | null | undefined) => void
  t: (key: TranslationKey, params?: TranslationParams) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)
