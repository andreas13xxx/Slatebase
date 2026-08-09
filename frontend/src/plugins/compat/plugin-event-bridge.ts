/**
 * PluginEventBridge — Connects Slatebase state changes to Obsidian plugin shim events.
 *
 * This module provides a React hook that bridges Slatebase's tab/file/save state
 * to the Obsidian-compatible WorkspaceShim and MetadataCacheShim event systems.
 *
 * When the active tab changes → emits `file-open` and `active-leaf-change` on WorkspaceShim
 * When a plugin-view-tab becomes active → emits `active-leaf-change` with the WorkspaceLeaf
 * When plugin-view-tabs open/close → emits `layout-change`
 * When a file is saved → emits `changed` on MetadataCacheShim
 * On first directoryTree load → emits `resolved` on MetadataCacheShim
 *
 * Requirements: 6.3, 6.4, 7.5, 7.6, 11.1, 11.2, 11.3, 11.4, 3.7, 12.4
 *
 * @module plugin-event-bridge
 */

import { useEffect, useRef, useCallback } from 'react'
import type { DirectoryTree } from '../../types'
import type { TabState } from '../../state/tabState'
import type { TFile } from './types'
import type { WorkspaceShim } from './shims/workspace-shim'
import type { MetadataCacheShim } from './shims/metadata-cache-shim'
import type { VaultShim } from './shims/vault-shim'
import { onRealtimeVaultChange } from '../../state/realtimeVaultBridge'

/** The prefix for plugin-view-tab virtual paths. */
const VIEW_PATH_PREFIX = '__view::'

// ─── Module-Level Plugin Write Tracker (Loop Prevention) ─────────────────────

/**
 * Tracks recent plugin-initiated file writes (path → timestamp).
 * Used to prevent SSE vault:change events from re-triggering VaultShim events
 * for writes that the plugin itself caused.
 */
const recentPluginWrites: Map<string, number> = new Map()

/** Debounce window in ms — SSE events within this window after a plugin write are skipped. */
const PLUGIN_WRITE_DEBOUNCE_MS = 500

/**
 * Mark a path as recently written by a plugin.
 * Called from VaultShim.modify/create/delete to prevent SSE event loops.
 */
export function markPluginWrite(path: string): void {
  recentPluginWrites.set(path, Date.now())
  // Cleanup old entries periodically (keep map from growing unbounded)
  if (recentPluginWrites.size > 100) {
    const now = Date.now()
    for (const [key, ts] of recentPluginWrites) {
      if (now - ts > PLUGIN_WRITE_DEBOUNCE_MS * 2) {
        recentPluginWrites.delete(key)
      }
    }
  }
}

/** Options for the plugin event bridge hook. */
export interface PluginEventBridgeOptions {
  /** Current tab state (active tab, open tabs) */
  tabState: TabState
  /** The current directory tree for the active vault (null if not loaded yet) */
  directoryTree: DirectoryTree | null
  /** Shared WorkspaceShim instance for the current vault (null if no vault) */
  workspaceShim: WorkspaceShim | null
  /** Shared MetadataCacheShim instance for the current vault (null if no vault) */
  metadataCacheShim: MetadataCacheShim | null
  /** Shared VaultShim instance for the current vault (null if no vault) */
  vaultShim: VaultShim | null
  /** Current vault ID (needed for filtering SSE events) */
  currentVaultId: string | null
}

/**
 * Builds a TFile object from a file path.
 * Used to construct the TFile argument for workspace events.
 */
export function buildTFileFromPath(filePath: string): TFile {
  const name = filePath.split('/').pop() ?? filePath
  const lastDot = name.lastIndexOf('.')
  const basename = lastDot > 0 ? name.slice(0, lastDot) : name
  const extension = lastDot > 0 ? name.slice(lastDot + 1) : ''

  return {
    path: filePath,
    name,
    basename,
    extension,
    stat: { mtime: Date.now(), ctime: 0, size: 0 },
    parent: null,
  }
}

/**
 * Counts the number of plugin-view-tabs (tabs with `__view::` prefix) in the tab list.
 */
function countPluginViewTabs(tabs: TabState['tabs']): number {
  let count = 0
  for (const tab of tabs) {
    if (tab.filePath.startsWith(VIEW_PATH_PREFIX)) {
      count++
    }
  }
  return count
}

/**
 * React hook that bridges Slatebase state changes to plugin shim events.
 *
 * - Detects active tab changes and calls `workspaceShim.setActiveFile()`
 *   which triggers `file-open` and `active-leaf-change` events.
 * - Detects plugin-view-tab activation and emits `active-leaf-change` with the WorkspaceLeaf.
 * - Emits `layout-change` when plugin view tabs open or close.
 * - Detects file saves (SAVE_SUCCESS) by monitoring tab content changes
 *   and emits `changed` on MetadataCacheShim.
 * - Emits MetadataCacheShim `resolved` event once after the initial directory tree loads.
 *
 * Requirements: 6.3, 6.4, 7.5, 7.6, 11.1, 11.2, 11.3, 11.4, 3.7, 12.4
 */
export function usePluginEventBridge({
  tabState,
  directoryTree,
  workspaceShim,
  metadataCacheShim,
  vaultShim,
  currentVaultId,
}: PluginEventBridgeOptions): void {
  // Track previous active tab to detect changes
  const prevActiveTabIdRef = useRef<string | null>(null)
  // Track whether `resolved` has been emitted for the current vault
  const resolvedEmittedRef = useRef(false)
  // Track previous tab content to detect saves
  const prevTabContentsRef = useRef<Map<string, string>>(new Map())
  // Track previous plugin view tab count for layout-change detection (Req 11.2, 11.3)
  const prevPluginViewTabCountRef = useRef<number>(0)

  // ─── Plugin view tab open/close → layout-change (Req 11.2, 11.3) ──────────

  useEffect(() => {
    if (!workspaceShim) return

    const currentCount = countPluginViewTabs(tabState.tabs)
    const previousCount = prevPluginViewTabCountRef.current

    if (currentCount !== previousCount) {
      prevPluginViewTabCountRef.current = currentCount
      // Emit layout-change when a plugin view tab is opened or closed
      workspaceShim.trigger('layout-change')
    }
  }, [tabState.tabs, workspaceShim])

  // ─── Active tab change → workspace events (Req 6.3, 6.4, 11.1, 11.4, 3.7, 12.4) ─

  useEffect(() => {
    if (!workspaceShim) return

    const currentActiveTabId = tabState.activeTabId
    const previousActiveTabId = prevActiveTabIdRef.current

    // Only emit when the active tab actually changes
    if (currentActiveTabId !== previousActiveTabId) {
      prevActiveTabIdRef.current = currentActiveTabId

      if (currentActiveTabId === null) {
        // No active tab → setActiveFile(null), setActiveLeafInternal(null),
        // emit active-leaf-change with null (Req 11.4)
        // Only manually trigger if setActiveFile won't trigger it (file already null)
        const wasFileActive = workspaceShim.getActiveFile() !== null
        workspaceShim.setActiveFile(null)
        workspaceShim.setActiveLeafInternal(null)
        workspaceShim.setEditorTextarea(null)
        if (!wasFileActive) {
          workspaceShim.trigger('active-leaf-change', null)
        }
      } else {
        const activeTab = tabState.tabs.find(t => t.id === currentActiveTabId)

        if (activeTab && activeTab.filePath.startsWith(VIEW_PATH_PREFIX)) {
          // Plugin-view-tab is active (Req 3.7, 11.1, 12.4)
          // getActiveFile() must return null — use silent clear if possible
          workspaceShim.setActiveFile(null)
          workspaceShim.setEditorTextarea(null)

          // Extract viewType and find the corresponding WorkspaceLeaf. Fall back to
          // an "empty" leaf (not bare null) if it can't be found yet — e.g. a race
          // where the view is still being created — since some plugins (Excalidraw)
          // dereference `leaf.view` on active-leaf-change without a null check.
          const viewType = activeTab.filePath.slice(VIEW_PATH_PREFIX.length)
          const leaves = workspaceShim.getLeavesOfType(viewType)
          const leaf = leaves[0] ?? workspaceShim.getOrCreateEmptyLeaf()

          // Update internal leaf tracking (no event emission from this call)
          workspaceShim.setActiveLeafInternal(leaf)

          // Emit active-leaf-change with the WorkspaceLeaf (Req 11.1)
          workspaceShim.trigger('active-leaf-change', leaf)
        } else if (activeTab && !activeTab.isBinary && activeTab.filePath !== '__graph__') {
          // Regular file tab is active → build TFile and set it (existing behavior)
          const tFile = buildTFileFromPath(activeTab.filePath)
          workspaceShim.setActiveFile(tFile)

          // Wire editor textarea: query DOM after React renders the textarea
          requestAnimationFrame(() => {
            const textarea = document.querySelector('.edit-mode-textarea') as HTMLTextAreaElement | null
            workspaceShim.setEditorTextarea(textarea)
          })
        } else if (activeTab && (activeTab.isBinary || activeTab.filePath === '__graph__')) {
          // Non-file tab (binary or graph) → null (Req 6.2)
          workspaceShim.setActiveFile(null)
          workspaceShim.setEditorTextarea(null)
        } else {
          // Tab not found → treat as no active tab (Req 11.4)
          const wasFileActive2 = workspaceShim.getActiveFile() !== null
          workspaceShim.setActiveFile(null)
          workspaceShim.setActiveLeafInternal(null)
          workspaceShim.setEditorTextarea(null)
          if (!wasFileActive2) {
            workspaceShim.trigger('active-leaf-change', null)
          }
        }
      }
    }
  }, [tabState.activeTabId, tabState.tabs, workspaceShim])

  // ─── File save detection → MetadataCache changed event (Req 7.5) ──────────

  useEffect(() => {
    if (!metadataCacheShim) return

    const currentContents = new Map<string, string>()
    for (const tab of tabState.tabs) {
      // Track content of non-binary markdown tabs (exclude plugin-view-tabs and graph)
      if (!tab.isBinary && !tab.loading && tab.filePath !== '__graph__' && !tab.filePath.startsWith(VIEW_PATH_PREFIX)) {
        currentContents.set(tab.id, tab.content)
      }
    }

    // Compare with previous contents to detect saves
    // A save is detected when tab.content changes (SAVE_SUCCESS updates content)
    // but editBuffer becomes null (indicating a successful save, not a load)
    for (const tab of tabState.tabs) {
      if (tab.isBinary || tab.loading || tab.filePath === '__graph__' || tab.filePath.startsWith(VIEW_PATH_PREFIX)) continue

      const prevContent = prevTabContentsRef.current.get(tab.id)
      const currentContent = tab.content

      // Content changed AND editBuffer is null means SAVE_SUCCESS happened
      if (prevContent !== undefined && prevContent !== currentContent && tab.editBuffer === null) {
        const tFile = buildTFileFromPath(tab.filePath)
        // Emit 'changed' with the file and a minimal CachedMetadata
        // (the full metadata parsing is done by the shim's cache if populated)
        metadataCacheShim.trigger('changed', tFile, {})
      }
    }

    prevTabContentsRef.current = currentContents
  }, [tabState.tabs, metadataCacheShim])

  // ─── Initial directory tree load → MetadataCache resolved event (Req 7.6) ─

  useEffect(() => {
    if (!metadataCacheShim) return

    // Emit 'resolved' once when directoryTree transitions from null to non-null
    if (directoryTree !== null && !resolvedEmittedRef.current) {
      resolvedEmittedRef.current = true
      metadataCacheShim.trigger('resolved')
    }
  }, [directoryTree, metadataCacheShim])

  // ─── Reset resolved flag when shim changes (vault switch) ─────────────────

  useEffect(() => {
    resolvedEmittedRef.current = false
  }, [metadataCacheShim])

  // ─── SSE vault:change → VaultShim events (LiveSync listens on vault.on) ───
  //
  // When the user edits a file (or another device pushes changes), the backend
  // sends an SSE vault:change event. We bridge this to VaultShim's event system
  // so LiveSync (and other plugins) can detect file modifications.
  //
  // Loop-prevention: Plugin-initiated writes (via VaultShim.modify/create/delete)
  // also trigger SSE events. We track recent plugin writes and skip the SSE event
  // if it arrives within 500ms for the same path.

  useEffect(() => {
    if (!vaultShim || !currentVaultId) return

    const unsub = onRealtimeVaultChange((event) => {
      // Only process events for the current vault
      if (event.vaultId !== currentVaultId) return

      // Loop-prevention: skip if this path was written by a plugin recently
      const lastWrite = recentPluginWrites.get(event.path)
      if (lastWrite !== undefined && Date.now() - lastWrite < PLUGIN_WRITE_DEBOUNCE_MS) {
        return
      }

      const tFile = buildTFileFromPath(event.path)

      switch (event.action) {
        case 'saved': {
          // Determine if this is a new file (create) or existing (modify)
          const existing = vaultShim.getAbstractFileByPath(event.path)
          if (existing) {
            vaultShim.trigger('modify', tFile)
          } else {
            vaultShim.trigger('create', tFile)
          }
          break
        }
        case 'deleted':
          vaultShim.trigger('delete', tFile)
          break
        case 'renamed':
          // SSE rename only provides the new path — emit as create
          vaultShim.trigger('create', tFile)
          break
      }
    })

    return unsub
  }, [vaultShim, currentVaultId])

  // ─── Window resize → workspace 'resize' event ─────────────────────────────
  //
  // Obsidian emits 'resize' when the workspace layout or window size changes.
  // We bridge the browser's native resize event to the workspace shim.

  const handleResize = useCallback(() => {
    workspaceShim?.trigger('resize')
  }, [workspaceShim])

  useEffect(() => {
    if (!workspaceShim) return
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [workspaceShim, handleResize])

  // ─── Editor change → workspace 'editor-change' event ──────────────────────
  //
  // Obsidian emits 'editor-change' when text is modified in the editor.
  // We listen to the editor's input events and forward them.
  // Note: We only emit for plugins that listen; many don't, so this is best-effort.

  useEffect(() => {
    if (!workspaceShim) return

    const handleEditorInput = () => {
      const activeEditor = workspaceShim.activeEditor
      if (activeEditor) {
        workspaceShim.trigger('editor-change', activeEditor.editor, activeEditor)
      }
    }

    // Listen to input events on the CM6 editor or textarea
    const observer = new MutationObserver(() => {
      // Re-attach listener when editor DOM changes
      const cmContent = document.querySelector('.cm-content')
      if (cmContent && !(cmContent as HTMLElement & { __editorChangeWired?: boolean }).__editorChangeWired) {
        (cmContent as HTMLElement & { __editorChangeWired?: boolean }).__editorChangeWired = true
        cmContent.addEventListener('input', handleEditorInput)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })

    // Also attach to existing CM content
    const cmContent = document.querySelector('.cm-content')
    if (cmContent) {
      cmContent.addEventListener('input', handleEditorInput)
    }

    // Attach to textarea fallback
    const textarea = document.querySelector('.edit-mode-textarea')
    if (textarea) {
      textarea.addEventListener('input', handleEditorInput)
    }

    return () => {
      observer.disconnect()
    }
  }, [workspaceShim])
}
