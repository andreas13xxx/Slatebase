import { useState, useEffect, useCallback, useRef } from 'react'
import { CommandPalette } from './CommandPalette'
import { usePluginContext } from '../plugins/compat/plugin-context'
import { useFeatureContext } from '../state/featureContext'
import { useTabContext } from '../state/tabContext'
import { useAppContext, loadVaults } from '../state/index'
import { useAuthContext } from '../state/authContext'
import { useNavigationHistory } from '../state/navigationHistoryContext'
import { openTab } from '../state/tabActions'
import { TemplateSelector } from './TemplateSelector'
import { QuickSwitcher } from './QuickSwitcher'
import { ReleaseNotesModal } from './ReleaseNotesModal'
import { DebugInfoModal } from './DebugInfoModal'
import { matchesShortcut } from '../state/keybindingsStore'
import { useTranslation } from '../i18n'
import { showToast } from './ToastNotification'
import { extractErrorMessage } from '../utils/error'
import type { Command } from '../plugins/compat/command-registry'
import type { IApiClient } from '../api'
import type { SettingsCategory, SettingsSection } from '../state/settingsState'
import { useLeftPanelContext, useRightPanelContext } from '../state/panelContext'
import { useSearchContext } from '../state/searchContext'
import { registerCoreAppCommands, type CoreAppCommandHandlers, type NavigablePage } from '../plugins/compat/core-commands-app'
import { collectFilesSorted } from '../plugins/link-resolver'
import { getActiveEditorView } from '../editor/plugin-extensions'
import { toggleToolbarVisible } from '../state/toolbarStore'

/**
 * Obsidian core-command IDs (from core-commands.ts / core-commands-app.ts) that do
 * exactly what an existing native `slatebase:*` command already does, mapped to the
 * ID of the native command that duplicates them. Those core commands stay registered
 * in the command registry — real community plugins still resolve them via
 * `executeCommandById()` — but are hidden from the palette itself *only when the
 * native command they duplicate is actually visible right now*.
 *
 * That condition matters: most native commands are gated (an open editor tab for
 * formatting commands, a selected vault for vault-scoped ones, ...), while these
 * compat commands are always registered unconditionally (matching real Obsidian,
 * where editor commands are always listed but no-op without an active note). A
 * static always-hide list would make the action disappear from the palette
 * entirely whenever the native gate isn't met — e.g. "Fett umschalten" vanishing
 * completely whenever no file is open in edit mode, instead of falling back to
 * the always-available compat entry the way it did before this dedup existed.
 */
const DUPLICATE_OF_NATIVE_COMMAND = new Map<string, string>([
  ['app:open-settings', 'slatebase:open-settings'],
  ['app:toggle-left-sidebar', 'slatebase:toggle-sidebar'],
  ['app:toggle-right-sidebar', 'slatebase:toggle-right-panel'],
  ['app:open-vault', 'slatebase:navigate-my-vaults'],
  ['app:switch-vault', 'slatebase:navigate-my-vaults'],
  ['app:open-another-vault', 'slatebase:navigate-my-vaults'],
  ['app:go-back', 'slatebase:navigate-back'],
  ['app:go-forward', 'slatebase:navigate-forward'],
  ['workspace:show-trash', 'slatebase:open-trash'],
  ['graph:open', 'slatebase:open-graph'],
  ['daily-notes', 'slatebase:daily-note'],
  ['insert-template', 'slatebase:insert-template'],
  ['random-note', 'slatebase:open-random-note'],
  ['app:toggle-ribbon', 'slatebase:toggle-toolbar'],
  ['command-palette:open', 'slatebase:open-command-palette'],
  ['file-explorer:new-file', 'slatebase:create-file'],
  ['file-explorer:new-file-in-current-tab', 'slatebase:create-file'],
  ['file-explorer:new-file-in-new-pane', 'slatebase:create-file'],
  ['markdown:toggle-preview', 'slatebase:toggle-mode'],
  ['editor:toggle-source', 'slatebase:toggle-mode'],
  ['global-search:open', 'slatebase:open-search'],
  ['switcher:open', 'slatebase:open-quick-switcher'],
  ['editor:toggle-line-numbers', 'slatebase:editor-toggle-line-numbers'],
  ['editor:set-heading-1', 'slatebase:editor-heading1'],
  ['editor:set-heading-2', 'slatebase:editor-heading2'],
  ['editor:set-heading-3', 'slatebase:editor-heading3'],
  ['editor:toggle-bold', 'slatebase:editor-bold'],
  ['editor:toggle-italics', 'slatebase:editor-italic'],
  ['editor:toggle-strikethrough', 'slatebase:editor-strikethrough'],
  ['editor:toggle-code', 'slatebase:editor-code'],
  ['editor:insert-link', 'slatebase:editor-link'],
  ['editor:toggle-bullet-list', 'slatebase:editor-bullet-list'],
  ['editor:toggle-numbered-list', 'slatebase:editor-numbered-list'],
  ['editor:toggle-blockquote', 'slatebase:editor-quote'],
  ['editor:insert-horizontal-rule', 'slatebase:editor-horizontal-rule'],
  ['editor:insert-table', 'slatebase:editor-table'],
])

/**
 * Props passed from AppContent to supply app-level action callbacks.
 */
export interface CommandPaletteContainerProps {
  onNavigate: (page: NavigablePage) => void
  onCreateVault: () => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onCreateCanvas: () => void
  onImportFile: () => void
  onImportFolder: () => void
  onExportVault: () => void
  onOpenGraph: () => void
  onOpenLocalGraph: (filePath: string) => void
  onDailyNote: () => void
  onDailyNoteOffset: (offsetDays: number) => void
  showSidebar: boolean
  showRightPanel: boolean
  onToggleSidebar: () => void
  onToggleRightPanel: () => void
  onOpenSettings: (nav?: { category: SettingsCategory; section: SettingsSection }) => void
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
  onCreateFolder,
  onCreateCanvas,
  onImportFile,
  onImportFolder,
  onExportVault,
  onOpenGraph,
  onOpenLocalGraph,
  onDailyNote,
  onDailyNoteOffset,
  showSidebar,
  showRightPanel,
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
  const { authState, authDispatch } = useAuthContext()
  const { state: rightPanelState, dispatch: rightPanelDispatch } = useRightPanelContext()
  const { state: leftPanelState, dispatch: leftPanelDispatch } = useLeftPanelContext()
  const { state: searchState } = useSearchContext()
  const { goBack, goForward } = useNavigationHistory()
  const { t, locale } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false)
  // 'create' opens the two-step "new note from template" flow, 'insert' drops
  // the template's text into the note that is already open.
  const [templateSelectorMode, setTemplateSelectorMode] = useState<'create' | 'insert'>('create')
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  const [debugInfoOpen, setDebugInfoOpen] = useState(false)

  /** Opens the template picker in "create a new note" mode. */
  const openTemplateSelector = useCallback(() => {
    setTemplateSelectorMode('create')
    setTemplateSelectorOpen(true)
  }, [])

  /**
   * Opens the template picker in "insert into the open note" mode.
   * Refuses early when there is no editor to insert into, so the user gets a
   * reason instead of a picker that silently does nothing on selection.
   */
  const openTemplateInserter = useCallback(() => {
    if (!state.selectedVaultId) return
    if (!getActiveEditorView()) {
      showToast('info', 'Keine Notiz im Bearbeiten-Modus geöffnet.')
      return
    }
    setTemplateSelectorMode('insert')
    setTemplateSelectorOpen(true)
  }, [state.selectedVaultId])

  /** Inserts the chosen template's text at the cursor of the active editor. */
  const handleTemplateContentInsert = useCallback((content: string) => {
    const view = getActiveEditorView()
    if (!view) {
      showToast('error', 'Keine Notiz im Bearbeiten-Modus geöffnet.')
      return
    }
    // A plain document change — the editor's updateListener picks it up and
    // marks the tab unsaved, so autosave handles persistence as with typing.
    view.dispatch(view.state.replaceSelection(content))
    view.focus()
  }, [])

  /**
   * Opens a random markdown note from the current vault.
   *
   * The note that is already open is excluded, so repeated invocations always
   * move somewhere — unless it is the vault's only note, in which case
   * excluding it would leave nothing to open.
   */
  const openRandomNote = useCallback(() => {
    const vaultId = state.selectedVaultId
    if (!vaultId || !apiClient) return
    const tree = state.vaultTrees[vaultId] ?? state.directoryTree
    if (!tree) return

    const notes = collectFilesSorted(tree).filter((f) => f.name.toLowerCase().endsWith('.md'))
    if (notes.length === 0) {
      showToast('info', 'Keine Notizen in diesem Vault.')
      return
    }
    const activePath = tabState.tabs.find((t) => t.id === tabState.activeTabId)?.filePath
    const candidates = notes.length > 1 ? notes.filter((f) => f.path !== activePath) : notes
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    if (!pick) return

    void openTab(tabDispatch, appDispatch, apiClient, vaultId, pick.path, pick.name)
  }, [state.selectedVaultId, state.vaultTrees, state.directoryTree, apiClient, tabState, tabDispatch, appDispatch])

  // ─── Custom events for the toolbar buttons ─────────────────────────────────
  // The toolbar buttons and the palette commands must do the same thing, so the
  // buttons dispatch these instead of carrying their own copies of the logic.
  useEffect(() => {
    function handleRandomNote() { openRandomNote() }
    function handleInsertTemplate() { openTemplateInserter() }

    window.addEventListener('slatebase:open-random-note', handleRandomNote)
    window.addEventListener('slatebase:insert-template', handleInsertTemplate)
    return () => {
      window.removeEventListener('slatebase:open-random-note', handleRandomNote)
      window.removeEventListener('slatebase:insert-template', handleInsertTemplate)
    }
  }, [openRandomNote, openTemplateInserter])

  // ─── Keyboard shortcuts for the toolbar-related commands ───────────────────
  // These ship without a default binding, so nothing fires until the user
  // assigns one in Einstellungen → Tastenkürzel (matchesShortcut returns false
  // for an unset shortcut). Registered here rather than in useGlobalShortcuts
  // because the handlers live in this component.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (matchesShortcut('slatebase:toggle-toolbar', e)) {
        e.preventDefault()
        toggleToolbarVisible()
      } else if (matchesShortcut('slatebase:open-random-note', e)) {
        e.preventDefault()
        openRandomNote()
      } else if (matchesShortcut('slatebase:insert-template', e)) {
        e.preventDefault()
        openTemplateInserter()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openRandomNote, openTemplateInserter])

  // ─── Core command registration (Obsidian's workspace:*/app:*/theme:*/... commands) ──
  // Registered once; commands read fresh state via this ref instead of stale closures
  // (same ref-indirection idiom EditMode.tsx uses for onSave — see its onSaveRef).
  const coreHandlersRef = useRef<CoreAppCommandHandlers>(null as unknown as CoreAppCommandHandlers)
  coreHandlersRef.current = {
    vaultId: state.selectedVaultId,
    vaultName: state.vaults.find((v) => v.id === state.selectedVaultId)?.name ?? '',
    // App.tsx always provides a real ApiClient to AppProvider; the context type
    // is nullable only to give tests a no-client default.
    apiClient: apiClient as IApiClient,
    tabState,
    tabDispatch,
    appDispatch,
    authState,
    authDispatch,
    showSidebar,
    showRightPanel,
    rightPanelSections: rightPanelState.sections,
    rightPanelDispatch,
    leftPanelSections: leftPanelState.sections,
    leftPanelDispatch,
    onToggleSidebar,
    onToggleRightPanel,
    onOpenSettings,
    onNavigate,
    onCreateFile,
    onCreateFolder,
    onCreateCanvas,
    onOpenGraph,
    onOpenLocalGraph,
    onDailyNote,
    onDailyNoteOffset,
    onCreateWelcomeVault: () => { void handleCreateWelcomeVault() },
    onOpenTemplateSelector: openTemplateSelector,
    onInsertTemplate: openTemplateInserter,
    onOpenRandomNote: openRandomNote,
    onToggleToolbar: toggleToolbarVisible,
    onOpenReleaseNotes: () => setReleaseNotesOpen(true),
    onOpenDebugInfo: () => setDebugInfoOpen(true),
    onNavigateBack: goBack,
    onNavigateForward: goForward,
    onOpenQuickSwitcher: () => { if (state.selectedVaultId) setQuickSwitcherOpen(true) },
    searchQuery: searchState.query,
    searchCaseSensitive: searchState.caseSensitive,
    searchRegex: searchState.regex,
  }

  useEffect(() => {
    registerCoreAppCommands(commandRegistry, () => coreHandlersRef.current, locale)
  }, [commandRegistry, locale])

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

  // ─── Keyboard shortcut: Quick Switcher (default: Ctrl+O / Cmd+O) ─────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (matchesShortcut('slatebase:open-quick-switcher', e)) {
        e.preventDefault()
        if (state.selectedVaultId) setQuickSwitcherOpen(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [state.selectedVaultId])

  // Also listen to the custom event (dispatched by the "Schnellwechsler öffnen" command)
  useEffect(() => {
    function handleOpen() {
      if (state.selectedVaultId) setQuickSwitcherOpen(true)
    }

    window.addEventListener('slatebase:open-quick-switcher', handleOpen)
    return () => {
      window.removeEventListener('slatebase:open-quick-switcher', handleOpen)
    }
  }, [state.selectedVaultId])

  // ─── Keyboard shortcut: Next/previous tab (default: Ctrl+Shift+] / Ctrl+Shift+[) ───
  // Ctrl+Tab / Ctrl+Shift+Tab were the original defaults but browsers intercept
  // them at the chrome level for their own tab switching before JS ever sees the
  // event — preventDefault() can't stop that. Bracket keys aren't reserved.
  // Registered here rather than in useGlobalShortcuts.ts because it needs
  // `commandRegistry` from usePluginContext() (see above) — PluginProvider is
  // mounted inside AppContent's own render tree, not above it, so a hook called
  // at the top of AppContent can't reach it. Delegates to the existing
  // workspace:next-tab/previous-tab core commands so the wrap-around logic in
  // activateTabByOffset() (core-commands-app.ts) lives in one place (Requirement 3.1).
  useEffect(() => {
    function handleTabCycleShortcut(e: KeyboardEvent): void {
      if (matchesShortcut('slatebase:next-tab', e)) {
        e.preventDefault()
        commandRegistry.executeCommand('workspace:next-tab')
      } else if (matchesShortcut('slatebase:previous-tab', e)) {
        e.preventDefault()
        commandRegistry.executeCommand('workspace:previous-tab')
      }
    }

    window.addEventListener('keydown', handleTabCycleShortcut)
    return () => window.removeEventListener('keydown', handleTabCycleShortcut)
  }, [commandRegistry])

  const handleQuickSwitcherClose = useCallback(() => {
    setQuickSwitcherOpen(false)
  }, [])

  /** Creates a welcome/tutorial vault via the API, shows toast, refreshes vault list. */
  async function handleCreateWelcomeVault(): Promise<void> {
    if (!apiClient) return
    try {
      const result = await apiClient.createWelcomeVault()
      showToast('success', t('profile.welcomeVaultCreated', { name: result.vaultName }))
      await loadVaults(appDispatch, apiClient)
    } catch (err: unknown) {
      showToast('error', extractErrorMessage(err, t('profile.welcomeVaultError')))
    }
  }

  const handleExecute = useCallback((commandId: string) => {
    if (commandId === 'slatebase:new-from-template') {
      openTemplateSelector()
      return
    }
    // Try built-in commands first (they use the callback directly)
    const builtIn = buildBuiltinCommands()
    const builtInCmd = builtIn.find((c) => c.id === commandId)
    if (builtInCmd) {
      builtInCmd.callback?.()
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
      id: 'slatebase:toggle-toolbar',
      name: 'Werkzeugleiste ein-/ausblenden',
      callback: toggleToolbarVisible,
      pluginId: 'slatebase',
    })

    commands.push({
      id: 'slatebase:open-command-palette',
      name: 'Befehlspalette öffnen',
      callback: () => setIsOpen(true),
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
      callback: () => onOpenSettings({ category: 'account', section: 'my-vaults' }),
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

    // Toggle editor mode (always available when a non-binary file tab is active)
    if (activeTab && !activeTab.isBinary && activeTab.filePath !== '__graph__' && !activeTab.fileName.endsWith('.canvas')) {
      commands.push({
        id: 'slatebase:toggle-mode',
        name: 'Editor-Modus wechseln (Bearbeiten/Vorschau)',
        callback: () => tabDispatch({ type: 'TOGGLE_MODE', payload: { tabId: activeTab.id } }),
        pluginId: 'slatebase',
      })
    }

    // Open search (always available)
    commands.push({
      id: 'slatebase:open-search',
      name: 'Vault-Suche öffnen',
      callback: () => {
        window.dispatchEvent(new CustomEvent('slatebase:open-search'))
      },
      pluginId: 'slatebase',
    })

    if (hasVault) {
      commands.push({
        id: 'slatebase:open-quick-switcher',
        name: 'Schnellwechsler öffnen',
        callback: () => setQuickSwitcherOpen(true),
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:open-random-note',
        name: 'Zufällige Notiz öffnen',
        callback: openRandomNote,
        pluginId: 'slatebase',
      })
    }

    commands.push({
      id: 'slatebase:navigate-back',
      name: 'Zurück navigieren',
      callback: goBack,
      pluginId: 'slatebase',
    })

    commands.push({
      id: 'slatebase:navigate-forward',
      name: 'Vor navigieren',
      callback: goForward,
      pluginId: 'slatebase',
    })

    commands.push({
      id: 'slatebase:create-vault',
      name: 'Neuer Vault',
      callback: onCreateVault,
      pluginId: 'slatebase',
    })

    commands.push({
      id: 'create-welcome-vault',
      name: t('commands.createWelcomeVault'),
      callback: () => { handleCreateWelcomeVault() },
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
        callback: openTemplateSelector,
        pluginId: 'slatebase',
      })

      commands.push({
        id: 'slatebase:insert-template',
        name: 'Vorlage einfügen',
        callback: openTemplateInserter,
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

      commands.push({
        id: 'slatebase:open-graph',
        name: 'Knowledge Graph öffnen',
        callback: onOpenGraph,
        pluginId: 'slatebase',
      })

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

  // Value substituted for a template's {{title}} when inserting into an open
  // note — the note's own name, mirroring what createFromTemplate uses for a
  // newly created file.
  const activeTabTitle = (tabState.tabs.find((tab) => tab.id === tabState.activeTabId)?.fileName ?? '').replace(/\.md$/, '')

  // Combine built-in + plugin commands
  const builtinCommands = buildBuiltinCommands()
  const visibleNativeIds = new Set(builtinCommands.map((c) => c.id))
  const pluginCommands = pluginCompatEnabled
    ? commandRegistry.getCommands().filter((c) => {
        const nativeId = DUPLICATE_OF_NATIVE_COMMAND.get(c.id)
        return nativeId === undefined || !visibleNativeIds.has(nativeId)
      })
    : []
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
          mode={templateSelectorMode}
          onInsertContent={handleTemplateContentInsert}
          insertTitle={activeTabTitle}
        />
      )}
      {state.selectedVaultId && apiClient && (
        <QuickSwitcher
          isOpen={quickSwitcherOpen}
          onClose={handleQuickSwitcherClose}
          vaultId={state.selectedVaultId}
          directoryTree={state.vaultTrees[state.selectedVaultId] ?? state.directoryTree}
          apiClient={apiClient}
          tabDispatch={tabDispatch}
          appDispatch={appDispatch}
        />
      )}
      <ReleaseNotesModal
        open={releaseNotesOpen}
        onClose={() => setReleaseNotesOpen(false)}
      />
      <DebugInfoModal
        open={debugInfoOpen}
        onClose={() => setDebugInfoOpen(false)}
        vaultName={selectedVault?.name ?? null}
      />
    </>
  )
}
