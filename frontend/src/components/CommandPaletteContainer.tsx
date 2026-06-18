import { useState, useEffect, useCallback } from 'react'
import { CommandPalette } from './CommandPalette'
import { usePluginContext } from '../plugins/compat/plugin-context'
import { useFeatureContext } from '../state/featureContext'
import { useTabContext } from '../state/tabContext'
import { useAppContext } from '../state/index'
import { useAuthContext } from '../state/authContext'
import { openTab } from '../state/tabActions'
import { TemplateSelector } from './TemplateSelector'
import { matchesShortcut } from '../state/keybindingsStore'
import type { Command } from '../plugins/compat/command-registry'

/** Pages the CommandPalette can navigate to. */
type NavigablePage =
  | 'profile' | 'sessions' | 'my-vaults' | 'chat' | 'mcp-tokens'
  | 'admin-users' | 'admin-vaults' | 'admin-config' | 'admin-audit' | 'admin-logs'
  | 'trash' | 'sync-config' | 'sync-log' | 'plugins'

/**
 * Props passed from AppContent to supply app-level action callbacks.
 */
export interface CommandPaletteContainerProps {
  onNavigate: (page: NavigablePage) => void
  onCreateVault: () => void
  onCreateFile: () => void
  onImportFile: () => void
  onImportFolder: () => void
  onExportVault: () => void
  onOpenGraph: () => void
  onDailyNote: () => void
  onToggleSidebar: () => void
  onToggleRightPanel: () => void
  onOpenSettings: () => void
  onLogout: () => void
  onToggleTheme: () => void
}

/**
 * CommandPaletteContainer — Renders the CommandPalette modal overlay and registers
 * the Ctrl+P / Cmd+P keyboard shortcut for opening it.
 *
 * Always renders (independent of obsidian-plugin-compat feature toggle).
 * Built-in commands are always available. Plugin commands are included
 * only when the obsidian-plugin-compat feature is enabled.
 *
 * This component is rendered at the root level of the authenticated app layout
 * so it overlays everything when opened.
 */
export function CommandPaletteContainer({
  onNavigate,
  onCreateVault,
  onCreateFile,
  onImportFile,
  onImportFolder,
  onExportVault,
  onOpenGraph,
  onDailyNote,
  onToggleSidebar,
  onToggleRightPanel,
  onOpenSettings,
  onLogout,
  onToggleTheme,
}: CommandPaletteContainerProps) {
  const { commandRegistry } = usePluginContext()
  const { isEnabled } = useFeatureContext()
  const { tabState, tabDispatch } = useTabContext()
  const { state, dispatch: appDispatch, apiClient } = useAppContext()
  const { authState } = useAuthContext()
  const [isOpen, setIsOpen] = useState(false)
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false)

  const pluginCompatEnabled = isEnabled('obsidian-plugin-compat')
  const isAdmin = authState.user?.role === 'admin'
  const hasVault = state.selectedVaultId !== null
  const selectedVault = state.vaults.find((v) => v.id === state.selectedVaultId) ?? null
  const isVaultOwner = selectedVault?.permission === 'owner'
  const hasWriteAccess = selectedVault?.permission === 'owner' || selectedVault?.permission === 'write'

  // ─── Keyboard shortcut: Command Palette (default: Ctrl+P / Cmd+P) ────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (matchesShortcut('slatebase:open-command-palette', e)) {
        e.preventDefault()
        setIsOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Also listen to the legacy custom event (for plugin-compat backward compat)
  useEffect(() => {
    function handleOpen() {
      setIsOpen(true)
    }

    window.addEventListener('slatebase:open-command-palette', handleOpen)
    return () => {
      window.removeEventListener('slatebase:open-command-palette', handleOpen)
    }
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleExecute = useCallback((commandId: string) => {
    if (commandId === 'slatebase:new-from-template') {
      setTemplateSelectorOpen(true)
      return
    }
    // Try built-in commands first (they use the callback directly)
    const builtIn = buildBuiltinCommands()
    const builtInCmd = builtIn.find((c) => c.id === commandId)
    if (builtInCmd) {
      builtInCmd.callback()
      return
    }
    // Fall through to plugin command registry
    if (pluginCompatEnabled) {
      commandRegistry.executeCommand(commandId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginCompatEnabled, commandRegistry, hasVault, isAdmin, isVaultOwner, hasWriteAccess])

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

  /**
   * Builds the list of built-in commands based on current app state.
   * Commands are conditionally included depending on vault selection, permissions, etc.
   */
  function buildBuiltinCommands(): Command[] {
    const commands: Command[] = []

    // Determine if there's an active tab in edit mode (for editor commands)
    const activeTab = tabState.tabs.find((t) => t.id === tabState.activeTabId)
    const isEditing = activeTab !== undefined && activeTab.mode === 'edit' && !activeTab.isBinary && activeTab.filePath !== '__graph__'

    // ── Navigation ──────────────────────────────────────────────────────────

    commands.push({
      id: 'slatebase:open-settings',
      name: 'Einstellungen öffnen',
      callback: onOpenSettings,
      pluginId: 'slatebase',
    })

    commands.push({
      id: 'slatebase:toggle-theme',
      name: 'Farbschema umschalten (Hell/Dunkel)',
      callback: onToggleTheme,
      pluginId: 'slatebase',
    })

    commands.push({
      id: 'slatebase:toggle-sidebar',
      name: 'Seitenleiste ein-/ausblenden',
      callback: onToggleSidebar,
      pluginId: 'slatebase',
    })

    commands.push({
      id: 'slatebase:toggle-right-panel',
      name: 'Kontextpanel ein-/ausblenden',
      callback: onToggleRightPanel,
      pluginId: 'slatebase',
    })

    commands.push({
      id: 'slatebase:navigate-profile',
      name: 'Profil',
      callback: () => onNavigate('profile'),
      pluginId: 'slatebase',
    })

    commands.push({
      id: 'slatebase:navigate-sessions',
      name: 'Sitzungen',
      callback: () => onNavigate('sessions'),
      pluginId: 'slatebase',
    })

    commands.push({
      id: 'slatebase:navigate-my-vaults',
      name: 'Meine Vaults',
      callback: () => onNavigate('my-vaults'),
      pluginId: 'slatebase',
    })

    if (isEnabled('chat')) {
      commands.push({
        id: 'slatebase:navigate-chat',
        name: 'Chat öffnen',
        callback: () => onNavigate('chat'),
        pluginId: 'slatebase',
      })
    }

    if (isEnabled('mcp')) {
      commands.push({
        id: 'slatebase:navigate-mcp-tokens',
        name: 'API-Tokens (MCP)',
        callback: () => onNavigate('mcp-tokens'),
        pluginId: 'slatebase',
      })
    }

    commands.push({
      id: 'slatebase:logout',
      name: 'Abmelden',
      callback: onLogout,
      pluginId: 'slatebase',
    })

    // ── Admin ───────────────────────────────────────────────────────────────

    if (isAdmin) {
      commands.push({
        id: 'slatebase:admin-users',
        name: 'Benutzerverwaltung',
        callback: () => onNavigate('admin-users'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:admin-vaults',
        name: 'Vault-Übersicht (Admin)',
        callback: () => onNavigate('admin-vaults'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:admin-config',
        name: 'Serverkonfiguration',
        callback: () => onNavigate('admin-config'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:admin-audit',
        name: 'Audit-Log',
        callback: () => onNavigate('admin-audit'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:admin-logs',
        name: 'Server-Logs',
        callback: () => onNavigate('admin-logs'),
        pluginId: 'slatebase',
      })
    }

    // ── Vault operations (require a vault selected) ─────────────────────────

    commands.push({
      id: 'slatebase:create-vault',
      name: 'Neuer Vault',
      callback: onCreateVault,
      pluginId: 'slatebase',
    })

    if (hasVault && hasWriteAccess) {
      commands.push({
        id: 'slatebase:create-file',
        name: 'Neue Datei',
        callback: onCreateFile,
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:daily-note',
        name: 'Tagesnotiz öffnen/erstellen',
        callback: onDailyNote,
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:new-from-template',
        name: 'Neue Notiz aus Vorlage',
        callback: () => setTemplateSelectorOpen(true),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:import-file',
        name: 'Datei importieren',
        callback: onImportFile,
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:import-folder',
        name: 'Ordner importieren',
        callback: onImportFolder,
        pluginId: 'slatebase',
      })
    }

    if (hasVault) {
      commands.push({
        id: 'slatebase:export-vault',
        name: 'Vault exportieren (ZIP)',
        callback: onExportVault,
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:open-trash',
        name: 'Papierkorb',
        callback: () => onNavigate('trash'),
        pluginId: 'slatebase',
      })

      if (isEnabled('knowledge-graph')) {
        commands.push({
          id: 'slatebase:open-graph',
          name: 'Knowledge Graph öffnen',
          callback: onOpenGraph,
          pluginId: 'slatebase',
        })
      }

      if (isEnabled('vault-sync') && isVaultOwner) {
        commands.push({
          id: 'slatebase:sync-config',
          name: 'Vault-Sync Konfiguration',
          callback: () => onNavigate('sync-config'),
          pluginId: 'slatebase',
        })

        commands.push({
          id: 'slatebase:sync-log',
          name: 'Sync-Protokoll',
          callback: () => onNavigate('sync-log'),
          pluginId: 'slatebase',
        })
      }

      if (isEnabled('obsidian-plugin-compat')) {
        commands.push({
          id: 'slatebase:plugins',
          name: 'Plugins verwalten',
          callback: () => onNavigate('plugins'),
          pluginId: 'slatebase',
        })
      }
    }

    // ── Editor commands (only when a file is open in edit mode) ──────────────

    if (isEditing) {
      const dispatch = (action: string) => () => {
        window.dispatchEvent(new CustomEvent('slatebase:editor-command', { detail: { action } }))
      }

      commands.push({
        id: 'slatebase:editor-heading1',
        name: 'Editor: Überschrift 1',
        callback: dispatch('heading1'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-heading2',
        name: 'Editor: Überschrift 2',
        callback: dispatch('heading2'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-heading3',
        name: 'Editor: Überschrift 3',
        callback: dispatch('heading3'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-bold',
        name: 'Editor: Fett',
        callback: dispatch('bold'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-italic',
        name: 'Editor: Kursiv',
        callback: dispatch('italic'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-strikethrough',
        name: 'Editor: Durchgestrichen',
        callback: dispatch('strikethrough'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-code',
        name: 'Editor: Code (inline)',
        callback: dispatch('code'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-link',
        name: 'Editor: Link einfügen',
        callback: dispatch('link'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-bullet-list',
        name: 'Editor: Aufzählung',
        callback: dispatch('bulletList'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-numbered-list',
        name: 'Editor: Nummerierte Liste',
        callback: dispatch('numberedList'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-task',
        name: 'Editor: Aufgabe (Checkbox)',
        callback: dispatch('task'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-quote',
        name: 'Editor: Zitat',
        callback: dispatch('quote'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-horizontal-rule',
        name: 'Editor: Horizontale Linie',
        callback: dispatch('horizontalRule'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-table',
        name: 'Editor: Tabelle einfügen',
        callback: dispatch('table'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-undo',
        name: 'Editor: Rückgängig',
        callback: dispatch('undo'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-redo',
        name: 'Editor: Wiederherstellen',
        callback: dispatch('redo'),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:editor-toggle-line-numbers',
        name: 'Editor: Zeilennummern umschalten',
        callback: dispatch('toggleLineNumbers'),
        pluginId: 'slatebase',
      })
    }

    return commands
  }

  // Combine built-in + plugin commands
  const builtinCommands = buildBuiltinCommands()
  const pluginCommands = pluginCompatEnabled ? commandRegistry.getCommands() : []
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
