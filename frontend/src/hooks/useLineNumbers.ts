/**
 * useLineNumbers — editor gutter line numbers.
 *
 * A vault setting: it lives in the vault's `.obsidian/app.json` (`showLineNumber`), the same
 * file Obsidian reads, so it is the same for everyone who opens the vault and changing it needs
 * write access. It used to be stored per user and vault.
 *
 * Reached through the editor context menu, not the settings panel.
 */
import { useCallback } from 'react'
import { toggleAppConfigFlag } from './appConfigToggle'
import { useAppConfigValue } from '../state/vaultAppConfigStore'

/** Return value of the useLineNumbers hook. */
export interface UseLineNumbersReturn {
  /** Whether line numbers are currently enabled. */
  enabled: boolean
  /** Toggles line numbers on/off for the active vault. */
  toggle(): void
}

/** Toggles line numbers from outside React (command palette, context menu). */
export function toggleLineNumbers(): void {
  toggleAppConfigFlag('showLineNumber')
}

/** Line numbers state for the active vault. */
export function useLineNumbers(): UseLineNumbersReturn {
  const enabled = useAppConfigValue('showLineNumber')
  const toggle = useCallback(() => { toggleLineNumbers() }, [])
  return { enabled, toggle }
}
