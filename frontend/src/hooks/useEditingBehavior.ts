/**
 * useEditingBehavior — tab/indent and auto-pair behavior of the editor.
 *
 * A vault setting: `useTab`, `tabSize`, `autoPairBrackets` and `autoPairMarkdown` live in the
 * vault's `.obsidian/app.json`, the same file Obsidian reads, so they are the same for everyone who
 * opens the vault and changing them needs write access (Settings → Vault → Editor und Dateien).
 */
import { useMemo } from 'react'
import { useAppConfigValue } from '../state/vaultAppConfigStore'
import type { EditingBehavior } from '../editor/editing-behavior'

/** The active vault's editing behavior. The object only changes when one of its values does. */
export function useEditingBehavior(): EditingBehavior {
  const useTab = useAppConfigValue('useTab')
  const tabSize = useAppConfigValue('tabSize')
  const autoPairBrackets = useAppConfigValue('autoPairBrackets')
  const autoPairMarkdown = useAppConfigValue('autoPairMarkdown')
  return useMemo(
    () => ({ useTab, tabSize, autoPairBrackets, autoPairMarkdown }),
    [useTab, tabSize, autoPairBrackets, autoPairMarkdown],
  )
}
