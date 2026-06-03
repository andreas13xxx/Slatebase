/**
 * PluginEventBridge — Connects Slatebase state changes to Obsidian plugin shim events.
 *
 * This module provides a React hook that bridges Slatebase's tab/file/save state
 * to the Obsidian-compatible WorkspaceShim and MetadataCacheShim event systems.
 *
 * When the active tab changes → emits `file-open` and `active-leaf-change` on WorkspaceShim
 * When a file is saved → emits `changed` on MetadataCacheShim
 * On first directoryTree load → emits `resolved` on MetadataCacheShim
 *
 * Requirements: 6.3, 6.4, 7.5, 7.6
 *
 * @module plugin-event-bridge
 */

import { useEffect, useRef } from 'react'
import type { DirectoryTree } from '../../types'
import type { TabState } from '../../state/tabState'
import type { TFile } from './types'
import type { WorkspaceShim } from './shims/workspace-shim'
import type { MetadataCacheShim } from './shims/metadata-cache-shim'

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
}

/**
 * Builds a TFile object from a file path.
 * Used to construct the TFile argument for workspace events.
 */
function buildTFileFromPath(filePath: string): TFile {
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
 * React hook that bridges Slatebase state changes to plugin shim events.
 *
 * - Detects active tab changes and calls `workspaceShim.setActiveFile()`
 *   which triggers `file-open` and `active-leaf-change` events.
 * - Detects file saves (SAVE_SUCCESS) by monitoring tab content changes
 *   and emits `changed` on MetadataCacheShim.
 * - Emits MetadataCacheShim `resolved` event once after the initial directory tree loads.
 *
 * Requirements: 6.3, 6.4, 7.5, 7.6
 */
export function usePluginEventBridge({
  tabState,
  directoryTree,
  workspaceShim,
  metadataCacheShim,
}: PluginEventBridgeOptions): void {
  // Track previous active tab to detect changes
  const prevActiveTabIdRef = useRef<string | null>(null)
  // Track whether `resolved` has been emitted for the current vault
  const resolvedEmittedRef = useRef(false)
  // Track previous tab content to detect saves
  const prevTabContentsRef = useRef<Map<string, string>>(new Map())

  // ─── Active tab change → workspace events (Req 6.3, 6.4) ──────────────────

  useEffect(() => {
    if (!workspaceShim) return

    const currentActiveTabId = tabState.activeTabId
    const previousActiveTabId = prevActiveTabIdRef.current

    // Only emit when the active tab actually changes
    if (currentActiveTabId !== previousActiveTabId) {
      prevActiveTabIdRef.current = currentActiveTabId

      if (currentActiveTabId === null) {
        // No active tab → setActiveFile(null) triggers active-leaf-change with null
        workspaceShim.setActiveFile(null)
      } else {
        const activeTab = tabState.tabs.find(t => t.id === currentActiveTabId)
        if (activeTab && !activeTab.isBinary && activeTab.filePath !== '__graph__') {
          // File tab is active → build TFile and set it
          const tFile = buildTFileFromPath(activeTab.filePath)
          workspaceShim.setActiveFile(tFile)
        } else if (activeTab && (activeTab.isBinary || activeTab.filePath === '__graph__')) {
          // Non-file tab (binary or graph) → null (Req 6.2)
          workspaceShim.setActiveFile(null)
        } else {
          workspaceShim.setActiveFile(null)
        }
      }
    }
  }, [tabState.activeTabId, tabState.tabs, workspaceShim])

  // ─── File save detection → MetadataCache changed event (Req 7.5) ──────────

  useEffect(() => {
    if (!metadataCacheShim) return

    const currentContents = new Map<string, string>()
    for (const tab of tabState.tabs) {
      // Track content of non-binary markdown tabs
      if (!tab.isBinary && !tab.loading && tab.filePath !== '__graph__') {
        currentContents.set(tab.id, tab.content)
      }
    }

    // Compare with previous contents to detect saves
    // A save is detected when tab.content changes (SAVE_SUCCESS updates content)
    // but editBuffer becomes null (indicating a successful save, not a load)
    for (const tab of tabState.tabs) {
      if (tab.isBinary || tab.loading || tab.filePath === '__graph__') continue

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
}
