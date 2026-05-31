/**
 * Main ContextPanel component.
 *
 * Orchestrates data loading for all context panel views (Outline, Links, Tags, Properties).
 * Debounces content-change updates (500ms), loads backlinks on document path change,
 * loads tags on vault change, and wires tab switching, reordering, and splitting
 * to the context panel reducer.
 *
 * Validates: Requirements 2.4, 2.6, 3.7, 3.8, 5.4
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useContextPanelContext } from '../../state/contextPanelContext'
import { useAppContext } from '../../state'
import { useTabContext } from '../../state/tabContext'
import {
  loadOutline,
  loadForwardLinks,
  loadBacklinks,
  loadTags,
  loadProperties,
  expandTag,
} from '../../state/contextPanelActions'
import { openTab } from '../../state/tabActions'
import { SplitSectionContainer } from './SplitSectionContainer'
import { ContextPanelTabBar } from './ContextPanelTabBar'
import { OutlineView } from './OutlineView'
import { LinksView } from './LinksView'
import { TagsView } from './TagsView'
import { PropertiesView } from './PropertiesView'
import type { ContextPanelViewId } from '../../state/contextPanelState'
import './ContextPanel.css'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Debounce delay for content-change updates (outline, forward links, properties). */
const CONTENT_DEBOUNCE_MS = 500

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ContextPanelProps {
  /** Current document content (from active tab's editBuffer or content) */
  documentContent: string | null
  /** Current document file path (relative to vault root) */
  documentPath: string | null
  /** Current vault ID */
  vaultId: string | null
  /** Panel width in pixels (from useResize) */
  width: number
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ContextPanel({ documentContent, documentPath, vaultId, width }: ContextPanelProps) {
  const { state, dispatch } = useContextPanelContext()
  const { state: appState, dispatch: appDispatch, apiClient } = useAppContext()
  const { tabDispatch } = useTabContext()

  // Refs for debounce and tracking previous values
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevDocumentPathRef = useRef<string | null>(null)
  const prevVaultIdRef = useRef<string | null>(null)
  const panelBodyRef = useRef<HTMLDivElement>(null)
  const [panelHeight, setPanelHeight] = useState(400)

  // ─── Panel Height Measurement ──────────────────────────────────────────────

  useEffect(() => {
    if (!panelBodyRef.current) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setPanelHeight(entry.contentRect.height)
      }
    })

    observer.observe(panelBodyRef.current)
    return () => observer.disconnect()
  }, [])

  // ─── Document Switch: Reset + Load All ─────────────────────────────────────

  useEffect(() => {
    const pathChanged = documentPath !== prevDocumentPathRef.current

    if (pathChanged) {
      // Document switched — reset state and load fresh data
      dispatch({ type: 'RESET_DOCUMENT_STATE' })

      if (documentContent !== null && documentPath !== null) {
        // Load content-dependent views immediately on document switch
        loadOutline(dispatch, documentContent)
        loadForwardLinks(dispatch, documentContent, appState.directoryTree)
        loadProperties(dispatch, documentContent)
      }

      // Load backlinks when document path changes (no debounce)
      if (documentPath !== null && vaultId !== null && apiClient) {
        void loadBacklinks(dispatch, apiClient, vaultId, documentPath)
      }

      prevDocumentPathRef.current = documentPath
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentPath])

  // ─── Content Change: Debounced Update ──────────────────────────────────────

  useEffect(() => {
    // Skip if document path just changed (handled above) or no content
    if (documentPath !== prevDocumentPathRef.current) return
    if (documentContent === null) return

    // Clear any pending debounce timer
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      loadOutline(dispatch, documentContent)
      loadForwardLinks(dispatch, documentContent, appState.directoryTree)
      loadProperties(dispatch, documentContent)
      debounceTimerRef.current = null
    }, CONTENT_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentContent])

  // ─── Vault Change: Load Tags ───────────────────────────────────────────────

  useEffect(() => {
    if (vaultId !== prevVaultIdRef.current) {
      if (vaultId !== null && apiClient) {
        void loadTags(dispatch, apiClient, vaultId)
      }
      prevVaultIdRef.current = vaultId
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId])

  // ─── Tab Switching ─────────────────────────────────────────────────────────

  const handleTabClick = useCallback((sectionId: string, viewId: ContextPanelViewId) => {
    dispatch({ type: 'SET_ACTIVE_VIEW', sectionId, viewId })
  }, [dispatch])

  // ─── Tab Reordering ────────────────────────────────────────────────────────

  const handleTabReorder = useCallback((_sectionId: string, newOrder: ContextPanelViewId[]) => {
    dispatch({ type: 'SET_TAB_ORDER', tabOrder: newOrder })
  }, [dispatch])

  // ─── Tab Splitting ─────────────────────────────────────────────────────────

  const handleTabSplit = useCallback((viewId: ContextPanelViewId) => {
    const targetIndex = state.sections.length
    dispatch({ type: 'SPLIT_VIEW', viewId, targetSectionIndex: targetIndex })
  }, [dispatch, state.sections.length])

  // ─── Tab Move (cross-section) ──────────────────────────────────────────────

  const handleTabMove = useCallback((viewId: ContextPanelViewId, targetSectionId: string) => {
    dispatch({ type: 'MOVE_VIEW_TO_SECTION', viewId, targetSectionId })
  }, [dispatch])

  // ─── Section Resize ────────────────────────────────────────────────────────

  const handleResize = useCallback((heightFractions: number[]) => {
    dispatch({ type: 'RESIZE_SECTIONS', heightFractions })
  }, [dispatch])

  // ─── Heading Click: Scroll to Anchor ───────────────────────────────────────

  const handleHeadingClick = useCallback((anchor: string) => {
    const element = document.getElementById(anchor)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // ─── Link Click: Open in New Tab ───────────────────────────────────────────

  const handleLinkClick = useCallback((target: string, resolved: boolean) => {
    if (!resolved) return
    if (!vaultId || !apiClient) return

    // Determine the file path — add .md extension if not present
    const filePath = target.endsWith('.md') ? target : `${target}.md`
    const parts = filePath.split('/')
    const fileName = parts[parts.length - 1] ?? filePath

    void openTab(tabDispatch, appDispatch, apiClient, vaultId, filePath, fileName)
  }, [vaultId, apiClient, tabDispatch, appDispatch])

  // ─── Tag Click: Expand/Collapse ────────────────────────────────────────────

  const handleTagClick = useCallback((tagName: string) => {
    if (state.tags.expandedTag === tagName) {
      // Collapse if already expanded
      dispatch({ type: 'SET_TAG_EXPANDED', tag: null, files: [] })
    } else {
      // Expand: fetch files for this tag
      if (vaultId && apiClient) {
        void expandTag(dispatch, apiClient, vaultId, tagName)
      }
    }
  }, [dispatch, state.tags.expandedTag, vaultId, apiClient])

  // ─── File Click (from Tags): Open in New Tab ──────────────────────────────

  const handleFileClick = useCallback((filePath: string) => {
    if (!vaultId || !apiClient) return

    const parts = filePath.split('/')
    const fileName = parts[parts.length - 1] ?? filePath

    void openTab(tabDispatch, appDispatch, apiClient, vaultId, filePath, fileName)
  }, [vaultId, apiClient, tabDispatch, appDispatch])

  // ─── Render View ───────────────────────────────────────────────────────────

  const renderView = useCallback((viewId: ContextPanelViewId) => {
    const hasDocument = documentContent !== null

    switch (viewId) {
      case 'outline':
        return (
          <OutlineView
            headings={state.outline.headings}
            activeAnchor={state.outline.activeAnchor}
            onHeadingClick={handleHeadingClick}
            hasDocument={hasDocument}
          />
        )
      case 'links':
        return (
          <LinksView
            forwardLinks={state.links.forward}
            backlinks={state.links.backlinks}
            backlinksLoading={state.links.backlinksLoading}
            backlinksError={state.links.backlinksError}
            onLinkClick={handleLinkClick}
            hasDocument={hasDocument}
          />
        )
      case 'tags':
        return (
          <TagsView
            tags={state.tags.entries}
            loading={state.tags.loading}
            expandedTag={state.tags.expandedTag}
            tagFiles={state.tags.tagFiles}
            onTagClick={handleTagClick}
            onFileClick={handleFileClick}
          />
        )
      case 'properties':
        return (
          <PropertiesView
            data={state.properties.data}
            parseError={state.properties.parseError}
            rawFrontmatter={state.properties.rawFrontmatter}
            hasDocument={hasDocument}
          />
        )
    }
  }, [
    documentContent,
    state.outline,
    state.links,
    state.tags,
    state.properties,
    handleHeadingClick,
    handleLinkClick,
    handleTagClick,
    handleFileClick,
  ])

  // ─── Single-Section Body Drop (split trigger) ───────────────────────────────

  const handleBodyDragOver = useCallback((e: React.DragEvent) => {
    // Only handle in single-section mode — allows dropping a tab onto the body to split
    if (state.sections.length !== 1) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [state.sections.length])

  const handleBodyDrop = useCallback((e: React.DragEvent) => {
    // Only handle in single-section mode
    if (state.sections.length !== 1) return
    e.preventDefault()

    const viewId = e.dataTransfer.getData('text/plain') as ContextPanelViewId
    if (viewId && state.sections[0]?.viewIds.includes(viewId)) {
      handleTabSplit(viewId)
    }
  }, [state.sections, handleTabSplit])

  // ─── Render ────────────────────────────────────────────────────────────────

  const isSingleSection = state.sections.length === 1

  return (
    <div className="context-panel" style={{ width }}>
      {/* Main TabBar — shown only in single-section mode */}
      {isSingleSection && state.sections[0] && (
        <ContextPanelTabBar
          tabs={state.sections[0].viewIds}
          activeTab={state.sections[0].activeViewId}
          onTabClick={(viewId) => handleTabClick(state.sections[0]!.id, viewId)}
          onTabReorder={(newOrder) => handleTabReorder(state.sections[0]!.id, newOrder)}
          onTabSplit={handleTabSplit}
          panelWidth={width}
        />
      )}
      <div
        className="context-panel__body"
        ref={panelBodyRef}
        onDragOver={handleBodyDragOver}
        onDrop={handleBodyDrop}
      >
        {isSingleSection && state.sections[0] ? (
          <div className="context-panel__single-view">
            {renderView(state.sections[0].activeViewId)}
          </div>
        ) : (
          <SplitSectionContainer
            sections={state.sections}
            panelWidth={width}
            panelHeight={panelHeight}
            onTabClick={handleTabClick}
            onTabReorder={handleTabReorder}
            onTabSplit={handleTabSplit}
            onTabMove={handleTabMove}
            onResize={handleResize}
            renderView={renderView}
          />
        )}
      </div>
    </div>
  )
}
