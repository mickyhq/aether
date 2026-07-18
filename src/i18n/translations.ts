import english from './catalogs/en.json'
import french from './catalogs/fr.json'
import italian from './catalogs/it.json'

export const APP_LANGUAGES = ['en', 'fr', 'it'] as const

export type AppLanguage = typeof APP_LANGUAGES[number]
export type TranslationKey = keyof typeof english
export type TranslationCatalog = Record<TranslationKey, string>

export const TRANSLATIONS = {
  en: english,
  fr: french,
  it: italian
} satisfies Record<AppLanguage, TranslationCatalog>
