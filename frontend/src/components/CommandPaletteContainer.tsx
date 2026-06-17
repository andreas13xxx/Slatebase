import { useState, useEffect, useCallback } from 'react'
import { CommandPalette } from './CommandPalette'
import { usePluginContext } from '../plugins/compat/plugin-context'
import { useFeatureContext } from '../state/featureContext'
import { useTabContext } from '../state/tabContext'
import { useAppContext } from '../state/index'
import { openTab } from '../state/tabActions'
import { TemplateSelector } from './TemplateSelector'
import type { Command } from '../plugins/compat/command-registry'

/**
 * CommandPaletteContainer — Listens to the `slatebase:open-command-palette` custom event
 * and renders the CommandPalette modal overlay, wired to the CommandRegistry from PluginProvider.
 *
 * Injects built-in commands (e.g., "Neue Notiz aus Vorlage") alongside plugin commands.
 *
 * This component is rendered at the root level of the authenticated app layout
 * so it overlays everything when opened.
 */
export function CommandPaletteContainer() {
  const { commandRegistry } = usePluginContext()
  const { isEnabled } = useFeatureContext()
  const { tabDispatch } = useTabContext()
  const { state, dispatch: appDispatch, apiClient } = useAppContext()
  const [isOpen, setIsOpen] = useState(false)
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false)

  const pluginCompatEnabled = isEnabled('obsidian-plugin-compat')

  // Listen to custom event dispatched by PluginProvider's Ctrl+P / Cmd+P handler
  useEffect(() => {
    if (!pluginCompatEnabled) return

    function handleOpen() {
      setIsOpen(true)
    }

    window.addEventListener('slatebase:open-command-palette', handleOpen)
    return () => {
      window.removeEventListener('slatebase:open-command-palette', handleOpen)
    }
  }, [pluginCompatEnabled])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleExecute = useCallback((commandId: string) => {
    if (commandId === 'slatebase:new-from-template') {
      setTemplateSelectorOpen(true)
      return
    }
    commandRegistry.executeCommand(commandId)
  }, [commandRegistry])

  /** Handle template file creation — open in tab and refresh tree. */
  const handleTemplateFileCreated = useCallback((filePath: string, fileName: string) => {
    const vaultId = state.selectedVaultId
    if (!vaultId || !apiClient) return
    openTab(tabDispatch, appDispatch, apiClient, vaultId, filePath, fileName.endsWith('.md') ? fileName : `${fileName}.md`)
    // Refresh file tree
    apiClient.fetchVaultTree(vaultId).then(
      (tree) => appDispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree } }),
      () => { /* ignore */ }
    )
  }, [state.selectedVaultId, apiClient, tabDispatch, appDispatch])

  if (!pluginCompatEnabled) return null

  // Combine plugin commands with built-in commands
  const pluginCommands = commandRegistry.getCommands()
  const builtinCommands: Command[] = []

  // Add "Neue Notiz aus Vorlage" if a vault is selected
  if (state.selectedVaultId) {
    builtinCommands.push({
      id: 'slatebase:new-from-template',
      name: 'Neue Notiz aus Vorlage',
      callback: () => setTemplateSelectorOpen(true),
      pluginId: 'slatebase',
    })
  }

  const allCommands = [...builtinCommands, ...pluginCommands]

  return (
    <>
      <CommandPalette
        commands={allCommands}
        isOpen={isOpen}
        onClose={handleClose}
        onExecute={handleExecute}
      />
      {state.selectedVaultId && apiClient && (
        <TemplateSelector
          isOpen={templateSelectorOpen}
          onClose={() => setTemplateSelectorOpen(false)}
          apiClient={apiClient}
          vaultId={state.selectedVaultId}
          targetDir=""
          onFileCreated={handleTemplateFileCreated}
        />
      )}
    </>
  )
}
