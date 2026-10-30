/**
 * useSpellcheck — Slatebase's own spellchecker for the editor: whether it runs
 * and which dictionary it uses.
 *
 * Whether it runs is a vault setting in `.obsidian/app.json` (`spellcheck`), the same for
 * everyone who opens the vault. The dictionary stays personal, stored per user and per vault via
 * `vaultSettingsStore`, so a German notebook and an English one each keep their own dictionary and
 * the choice follows the account across devices.
 *
 * Reached through the editor context menu, not the settings panel.
 */
import { useCallback } from 'react'
import { useVaultSettings, updateVaultSettings, getVaultSettings } from '../state/vaultSettingsStore'
import { useAppConfigValue } from '../state/vaultAppConfigStore'
import { toggleAppConfigFlag } from './appConfigToggle'
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
  toggleAppConfigFlag('spellcheck')
}

/** Switches the dictionary from outside React. */
export function setSpellcheckLanguage(language: SpellcheckLanguage): void {
  updateVaultSettings({ spellcheckLanguage: language })
}

/** Spellcheck state and dictionary for the active vault. */
export function useSpellcheck(): UseSpellcheckReturn {
  const settings = useVaultSettings()
  const enabled = useAppConfigValue('spellcheck')
  const language = isSpellcheckLanguage(settings.spellcheckLanguage)
    ? settings.spellcheckLanguage
    : DEFAULT_SPELLCHECK_LANGUAGE

  const toggle = useCallback(() => { toggleSpellcheck() }, [])
  const setLanguage = useCallback((next: SpellcheckLanguage) => { setSpellcheckLanguage(next) }, [])

  return { enabled, toggle, language, setLanguage }
}
