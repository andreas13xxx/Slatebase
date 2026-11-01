/**
 * useSpellcheck — Slatebase's own spellchecker for the editor: whether it runs
 * and which dictionary it uses.
 *
 * Whether it runs is a vault setting in `.obsidian/app.json` (`spellcheck`), the same for
 * everyone who opens the vault. So is the dictionary when the file names one (`spellcheckLanguages`,
 * Obsidian's list of language codes; the first one Slatebase has a dictionary for is used). Without
 * one the dictionary is personal, stored per user and per vault via `vaultSettingsStore`, so a German
 * notebook and an English one each keep their own dictionary and the choice follows the account
 * across devices.
 *
 * Reached through the editor context menu, not the settings panel.
 */
import { useCallback } from 'react'
import { useVaultSettings, updateVaultSettings, getVaultSettings } from '../state/vaultSettingsStore'
import { getAppConfigValue, updateAppConfig, useAppConfigValue } from '../state/vaultAppConfigStore'
import { showToast } from '../components/ToastNotification'
import { extractErrorMessage } from '../utils/error'
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
 * The dictionary for one language code of Obsidian's list (`de`, `en-US`, `de_DE`, ...): the part before
 * the region, if Slatebase ships that dictionary. Null for any other language.
 */
export function dictionaryForCode(code: string): SpellcheckLanguage | null {
  const base = code.trim().toLowerCase().split(/[-_]/)[0]
  return isSpellcheckLanguage(base) ? base : null
}

/** The first code of the list that Slatebase has a dictionary for, with its dictionary. */
function firstSupported(codes: readonly string[]): { index: number; language: SpellcheckLanguage } | null {
  for (let index = 0; index < codes.length; index++) {
    const language = dictionaryForCode(codes[index] ?? '')
    if (language) return { index, language }
  }
  return null
}

/**
 * The dictionary the vault's `spellcheckLanguages` asks for, or null if it names none Slatebase has.
 * Only one dictionary runs at a time, so later entries of the list are not used.
 */
export function vaultSpellcheckLanguage(codes: readonly string[]): SpellcheckLanguage | null {
  return firstSupported(codes)?.language ?? null
}

/**
 * The list with the vault's dictionary set to `language` (null: the vault names none, so the personal
 * choice applies). Entries Slatebase has no dictionary for stay; the first one it has is replaced, or
 * the language goes first.
 */
export function withVaultSpellcheckLanguage(codes: readonly string[], language: SpellcheckLanguage | null): string[] {
  const current = firstSupported(codes)
  if (language === null) return codes.filter((code) => dictionaryForCode(code) === null)
  if (current) return codes.map((code, index) => (index === current.index ? language : code))
  return [language, ...codes]
}

/** The personal language, falling back to German for anything unrecognised: a dictionary that was removed, or a hand-edited value. */
function personalLanguage(): SpellcheckLanguage {
  const stored = getVaultSettings().spellcheckLanguage
  return isSpellcheckLanguage(stored) ? stored : DEFAULT_SPELLCHECK_LANGUAGE
}

/** The dictionary in use: the vault's, if its file names one, else the personal choice. */
export function getSpellcheckLanguage(): SpellcheckLanguage {
  return vaultSpellcheckLanguage(getAppConfigValue('spellcheckLanguages')) ?? personalLanguage()
}

/** Toggles spellchecking from outside React (command palette, context menu). */
export function toggleSpellcheck(): void {
  toggleAppConfigFlag('spellcheck')
}

/**
 * Switches the dictionary from outside React. If the vault's file names one, the choice goes into the
 * file (it is the vault's), keeping the entries Slatebase has no dictionary for and any later ones;
 * it needs write access. Otherwise it is the personal choice.
 */
export function setSpellcheckLanguage(language: SpellcheckLanguage): void {
  const codes = getAppConfigValue('spellcheckLanguages')
  const current = firstSupported(codes)
  if (!current) {
    updateVaultSettings({ spellcheckLanguage: language })
    return
  }
  if (current.language === language) return
  updateAppConfig({ spellcheckLanguages: withVaultSpellcheckLanguage(codes, language) }).catch((error: unknown) => {
    showToast('error', `Vault-Einstellung konnte nicht gespeichert werden: ${extractErrorMessage(error)}`)
  })
}

/** Spellcheck state and dictionary for the active vault. */
export function useSpellcheck(): UseSpellcheckReturn {
  const settings = useVaultSettings()
  const enabled = useAppConfigValue('spellcheck')
  const vaultCodes = useAppConfigValue('spellcheckLanguages')
  const language = vaultSpellcheckLanguage(vaultCodes)
    ?? (isSpellcheckLanguage(settings.spellcheckLanguage) ? settings.spellcheckLanguage : DEFAULT_SPELLCHECK_LANGUAGE)

  const toggle = useCallback(() => { toggleSpellcheck() }, [])
  const setLanguage = useCallback((next: SpellcheckLanguage) => { setSpellcheckLanguage(next) }, [])

  return { enabled, toggle, language, setLanguage }
}
