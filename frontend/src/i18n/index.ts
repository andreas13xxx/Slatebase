import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import React from 'react'
import { de } from './de'
import { en } from './en'

export { de } from './de'
export { en } from './en'

/** Supported locale codes. */
export type Locale = 'de' | 'en'

/** Translation object type derived from the German (source) translations. */
export type Translations = typeof de

/** All available translations keyed by locale. */
const translations: Record<Locale, Record<string, unknown>> = { de, en }

/** Default locale (German, as per product spec). */
const DEFAULT_LOCALE: Locale = 'de'

/**
 * Detects the user's preferred locale from browser settings.
 * Used as fallback when no user profile is available (before login).
 * Defaults to German (product default) unless browser explicitly prefers English.
 */
function detectBrowserLocale(): Locale {
  try {
    const browserLang = navigator.language.toLowerCase()
    if (browserLang.startsWith('en')) return 'en'
  } catch {
    // navigator may not be available in some environments
  }
  return DEFAULT_LOCALE
}

/**
 * Recursively flattens a nested translation object into dot-separated keys.
 * Example: { auth: { login: 'Anmelden' } } → { 'auth.login': 'Anmelden' }
 */
type FlattenKeys<T, Prefix extends string = ''> = T extends string
  ? Prefix
  : T extends Record<string, unknown>
    ? { [K in keyof T & string]: FlattenKeys<T[K], Prefix extends '' ? K : `${Prefix}.${K}`> }[keyof T & string]
    : never

/** All valid translation keys as a union of dot-separated strings. */
export type TranslationKey = FlattenKeys<Translations>

/**
 * Resolves a dot-separated key path against a nested object.
 */
function resolve(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * Interpolates variables in a translation string.
 * Replaces {key} placeholders with values from the params object.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]
    return value !== undefined ? String(value) : `{${key}}`
  })
}

/** Translation function type for use as parameter in helper functions. */
export type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string

/** Context value shape for i18n. */
export interface I18nContextValue {
  /** Current active locale. */
  locale: Locale
  /** Change the active locale. Does NOT persist — use profile update for that. */
  setLocale: (locale: Locale) => void
  /** Translate a key with optional interpolation parameters. */
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

/** React Context for i18n. */
export const I18nContext = createContext<I18nContextValue | null>(null)

/** Props for the I18nProvider component. */
interface I18nProviderProps {
  children: ReactNode
  /**
   * Locale from the user's profile (preferredLanguage).
   * When provided, overrides browser detection.
   * When null/undefined, falls back to browser language detection.
   */
  userLocale?: Locale | null
  /** Override initial locale (useful for testing). */
  initialLocale?: Locale
}

/**
 * Provider component that wraps the app with i18n capabilities.
 * Locale is determined by the user's profile setting (preferredLanguage).
 * Before login, falls back to browser language detection.
 */
export function I18nProvider({ children, userLocale, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(
    initialLocale ?? userLocale ?? detectBrowserLocale
  )

  // Sync locale when user profile changes (login, profile update, logout)
  useEffect(() => {
    if (userLocale !== undefined && userLocale !== null) {
      setLocaleState(userLocale)
    }
  }, [userLocale])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
  }, [])

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>): string => {
    const value = resolve(translations[locale] as unknown as Record<string, unknown>, key)
    if (value === undefined) {
      // Fallback to German if key not found in current locale
      const fallback = resolve(translations.de as unknown as Record<string, unknown>, key)
      if (fallback === undefined) return key
      return interpolate(fallback, params)
    }
    return interpolate(value, params)
  }, [locale])

  return React.createElement(
    I18nContext.Provider,
    { value: { locale, setLocale, t } },
    children,
  )
}

/** Standalone translation function using German locale (for use outside provider). */
function createStandaloneT() {
  return (key: TranslationKey, params?: Record<string, string | number>): string => {
    const value = resolve(translations.de as unknown as Record<string, unknown>, key)
    if (value === undefined) return key
    return interpolate(value, params)
  }
}

/** Fallback context value used when no I18nProvider is present (e.g. in tests). */
const fallbackValue: I18nContextValue = {
  locale: 'de',
  setLocale: () => { /* no-op */ },
  t: createStandaloneT(),
}

/**
 * Hook to access i18n translations.
 * Falls back to German translations if used outside I18nProvider (e.g. in unit tests).
 */
export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext)
  if (context === null) {
    return fallbackValue
  }
  return context
}
