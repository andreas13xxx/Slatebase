/**
 * useWebEmbed — opt-in for auto-embedding `![](url)` web pages in a note.
 *
 * Stored per user and per vault (see useLineNumbers for the reasoning). Default
 * OFF: auto-loading a third-party URL from a document is a tracking / referer /
 * clickjacking surface and, in a shared vault, makes a reader's browser fetch
 * URLs an author put there. When off, `![](url)` renders a plain link instead.
 *
 * Unlike the editor toggles this one IS surfaced in the settings panel
 * (Vault config), because it changes what a note renders rather than a personal
 * editor comfort setting — users must be able to find and reason about it.
 */
import { useCallback } from 'react'
import { useVaultSetting, updateVaultSettings, getVaultSettings } from '../state/vaultSettingsStore'

/** Non-React read of the current vault's web-embed opt-in. */
export function getWebEmbedEnabled(): boolean {
  return getVaultSettings().webEmbedEnabled
}

/** Sets the web-embed opt-in for the active vault (from React or outside it). */
export function setWebEmbedEnabled(enabled: boolean): void {
  updateVaultSettings({ webEmbedEnabled: enabled })
}

/** Return value of the useWebEmbed hook. */
export interface UseWebEmbedReturn {
  /** Whether `![](url)` auto-embed is enabled for the active vault. */
  enabled: boolean
  /** Sets the opt-in for the active vault. */
  setEnabled(enabled: boolean): void
}

/** Web-embed opt-in state for the active vault. */
export function useWebEmbed(): UseWebEmbedReturn {
  const enabled = useVaultSetting('webEmbedEnabled')
  const setEnabled = useCallback((v: boolean) => { setWebEmbedEnabled(v) }, [])
  return { enabled, setEnabled }
}
