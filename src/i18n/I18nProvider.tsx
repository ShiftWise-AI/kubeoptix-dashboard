import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { Language } from '../services/settingsService'
import { I18nContext } from './I18nContext'
import { resolveLanguage, resolveLocale, translate, type TranslationKey, type TranslationParams } from './translate'

type I18nProviderProps = {
  children: ReactNode
  initialLanguage?: Language | string | null
}

export function I18nProvider({ children, initialLanguage }: I18nProviderProps) {
  const [language, setLanguageState] = useState<Language>(() => resolveLanguage(initialLanguage))

  const setLanguage = useCallback((nextLanguage: Language | string | null | undefined) => {
    setLanguageState(resolveLanguage(nextLanguage))
  }, [])

  const locale = resolveLocale(language)

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(locale, key, params),
    [locale],
  )

  const value = useMemo(
    () => ({ language, locale, setLanguage, t }),
    [language, locale, setLanguage, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
