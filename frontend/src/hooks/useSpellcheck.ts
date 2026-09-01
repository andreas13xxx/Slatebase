/**
 * useSpellcheck — Slatebase's own spellchecker for the editor: whether it runs
 * and which dictionary it uses.
 *
 * Stored per user *and* per vault via `vaultSettingsStore`, so a German
 * notebook and an English one each keep their own dictionary and the choice
 * still follows the account across devices. Previously one device-local
 * `localStorage` entry shared by every vault.
 *
 * Reached through the editor context menu, not the settings panel.
 */
import { useCallback } from 'react'
import { useVaultSettings, updateVaultSettings, getVaultSettings } from '../state/vaultSettingsStore'
import {
  DEFAULT_SPELLCHECK_LANGUAGE,
  isSpellcheckLanguage,
  type SpellcheckLanguage,
} from '../editor/spellcheck/protocol'

/** Return value of the useSpellcheck hook. */
export interface UseSpellcheckReturn {
  /** Whether spellchecking is currently enabled for the editor. */
  enabled: boolean
  /** Toggles spellchecking for the active vault. */
  toggle(): void
  /** The dictionary currently in use. */
  language: SpellcheckLanguage
  /** Switches the dictionary without touching the on/off state. */
  setLanguage(language: SpellcheckLanguage): void
}

/**
 * The stored language, falling back to German for anything unrecognised —
 * a dictionary that was removed, or a hand-edited value.
 */
export function getSpellcheckLanguage(): SpellcheckLanguage {
  const stored = getVaultSettings().spellcheckLanguage
  return isSpellcheckLanguage(stored) ? stored : DEFAULT_SPELLCHECK_LANGUAGE
}

/** Toggles spellchecking from outside React (command palette, context menu). */
export function toggleSpellcheck(): void {
  updateVaultSettings({ spellcheck: !getVaultSettings().spellcheck })
}

/** Switches the dictionary from outside React. */
export function setSpellcheckLanguage(language: SpellcheckLanguage): void {
  updateVaultSettings({ spellcheckLanguage: language })
}

/** Spellcheck state and dictionary for the active vault. */
export function useSpellcheck(): UseSpellcheckReturn {
  const settings = useVaultSettings()
  const language = isSpellcheckLanguage(settings.spellcheckLanguage)
    ? settings.spellcheckLanguage
    : DEFAULT_SPELLCHECK_LANGUAGE

  const toggle = useCallback(() => { toggleSpellcheck() }, [])
  const setLanguage = useCallback((next: SpellcheckLanguage) => { setSpellcheckLanguage(next) }, [])

  return { enabled: settings.spellcheck, toggle, language, setLanguage }
}
