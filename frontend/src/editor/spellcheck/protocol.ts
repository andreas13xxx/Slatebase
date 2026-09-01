/**
 * Message protocol and language metadata shared between the spellcheck Web
 * Worker (spellcheck.worker.ts) and its main-thread client
 * (spellcheck-client.ts).
 *
 * Kept in its own module so both sides import the same types without the main
 * thread pulling in the worker's `nspell` import (and with it the whole
 * dictionary machinery) just to name a message shape.
 *
 * @module spellcheck/protocol
 */

/** Dictionaries shipped with the app — see the `spellcheckDictionaries()` Vite plugin. */
export type SpellcheckLanguage = 'de' | 'en'

/** All selectable dictionary languages, in the order they appear in menus. */
export const SPELLCHECK_LANGUAGES: readonly SpellcheckLanguage[] = ['de', 'en']

/** Human-readable names for the language picker in the editor context menu. */
export const SPELLCHECK_LANGUAGE_LABELS: Record<SpellcheckLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
}

/**
 * Default dictionary. Matches `<html lang="de">` in index.html and the German
 * UI — a vault whose notes are mostly English is one context-menu click away.
 */
export const DEFAULT_SPELLCHECK_LANGUAGE: SpellcheckLanguage = 'de'

/** Type guard for values read back from localStorage, which may be anything. */
export function isSpellcheckLanguage(value: unknown): value is SpellcheckLanguage {
  return typeof value === 'string' && (SPELLCHECK_LANGUAGES as readonly string[]).includes(value)
}

/** Main thread → worker. */
export type SpellcheckRequest =
  | { kind: 'load'; language: SpellcheckLanguage; affUrl: string; dicUrl: string; personal: string[] }
  | { kind: 'check'; id: number; words: string[] }
  | { kind: 'suggest'; id: number; word: string }
  | { kind: 'add'; words: string[] }

/** Worker → main thread. */
export type SpellcheckResponse =
  | { kind: 'loaded'; language: SpellcheckLanguage }
  | { kind: 'load-failed'; language: SpellcheckLanguage; message: string }
  | { kind: 'check-result'; id: number; unknownWords: string[] }
  | { kind: 'suggest-result'; id: number; suggestions: string[] }
