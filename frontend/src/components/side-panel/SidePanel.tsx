/**
 * SidePanel — the single shared implementation for both the left and right
 * side panels. Which side it renders on (`side` prop) only determines: which
 * `PanelContext` instance backs it, which of `pluginContext.sidebarViews`/
 * `leftSidebarViews` supplies its plugin views, and which CSS look applies
 * (see SidePanel.css's `.app-right-panel` overrides). Every view — built-in
 * or plugin — can otherwise live on either side and move freely between them.
 */

import { useEffect, useRef, useCallback, useState, useContext } from 'react'
import { usePanelContextForSide } from '../../state/panelContext'
import { PanelTabBar } from './PanelTabBar'
import { PanelSplitContainer } from './PanelSplitContainer'
import { FavoritesView } from '../sidebar-panel/FavoritesView'
import { RecentFilesView } from '../sidebar-panel/RecentFilesView'
import { OutlineView } from '../context-panel/OutlineView'
import { LinksView } from '../context-panel/LinksView'
import { TagsView } from '../context-panel/TagsView'
import { PropertiesView } from '../context-panel/PropertiesView'
import { PropertiesEditor } from '../context-panel/PropertiesEditor'
import { SearchPanel } from '../SearchPanel'
import { isPluginViewId, getPluginViewType } from '../../state/panelState'
import type { PanelViewId } from '../../state/panelState'
import type { DocumentPanelState, UnlinkedMentionEntry } from '../../state/documentPanelData'
import { PluginContext } from '../../plugins/compat/plugin-context'
import type { SidebarViewInfo } from '../../plugins/compat/plugin-context'
import type { VaultInfo } from '../../types'
import './SidePanel.css'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SidePanelDocumentProps {
  outline: DocumentPanelState['outline']
  links: DocumentPanelState['links']
  tags: DocumentPanelState['tags']
  properties: DocumentPanelState['properties']
  hasDocument: boolean
  /** Whether the document can be edited (write access + markdown + edit mode). */
  canEditProperties: boolean
  /** Tag suggestions for the properties editor autocomplete. */
  tagSuggestions: string[]
  /** Callback to commit a frontmatter property change. */
  onPropertyCommit: (key: string, value: unknown) => void
  /** Callback to add a new frontmatter property. */
  onPropertyAdd: (key: string, value: unknown) => void
  /** Callback to delete a frontmatter property. */
  onPropertyDelete: (key: string) => void
  onHeadingClick: (anchor: string) => void
  onLinkClick: (target: string, resolved: boolean) => void
  onTagClick: (tagName: string) => void
  onFileClick: (filePath: string) => void
  /** Converts an Ungelinkte_Erwähnung into a real wikilink (Requirement 2.7). */
  onLinkMention: (entry: UnlinkedMentionEntry) => Promise<void>
}

export interface SidePanelSearchProps {
  vaults: VaultInfo[]
  selectedVaultId: string | null
  hasWriteAccess: boolean
  onNavigateToResult: (vaultId: string, filePath: string, line: number) => void
}

export interface SidePanelProps {
  /** Which side this instance renders — selects PanelContext, plugin view map, and CSS look. */
  side: 'left' | 'right'
  /** Panel width in pixels (from useResize). */
  width: number
  /** Current selected vault ID. */
  vaultId: string | null
  /** Callback to open a file in a tab. */
  onOpenFile: (vaultId: string, path: string) => void
  /** Render function for the File Explorer view (passed from parent). */
  renderExplorer: () => React.ReactNode
  /** Forces re-render of favorites/recent when data changes. */
  refreshKey?: number
  /** Data + handlers for the Outline/Links/Tags/Properties built-ins. */
  documentPanel: SidePanelDocumentProps
  /** Data + handlers for the Search built-in. */
  search: SidePanelSearchProps
  /** Moves a built-in view to the other side (cross-panel drag-and-drop). Plugin views use pluginContext.moveSidebarView instead. */
  onMoveBuiltinView: (viewId: PanelViewId, targetSide: 'left' | 'right') => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SidePanel({
  side,
  width,
  vaultId,
  onOpenFile,
  renderExplorer,
  refreshKey,
  documentPanel,
  search,
  onMoveBuiltinView,
}: SidePanelProps) {
  const { state, dispatch } = usePanelContextForSide(side)
  const panelBodyRef = useRef<HTMLDivElement>(null)
  const [panelHeight, setPanelHeight] = useState(400)

  // Access this side's plugin views (nullable — context may be null if PluginProvider not in tree)
  const pluginContext = useContext(PluginContext)
  const pluginViews: Map<string, SidebarViewInfo> =
    (side === 'right' ? pluginContext?.sidebarViews : pluginContext?.leftSidebarViews) ?? new Map()

  // ─── Sync plugin views with reducer state ──────────────────────────────────

  const prevPluginViewTypesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const currentViewTypes = new Set(pluginViews.keys())
    const prevViewTypes = prevPluginViewTypesRef.current

    for (const viewType of currentViewTypes) {
      if (!prevViewTypes.has(viewType)) {
        dispatch({ type: 'ADD_VIEW', viewId: `plugin:${viewType}` })
      }
    }

    for (const viewType of prevViewTypes) {
      if (!currentViewTypes.has(viewType)) {
        dispatch({ type: 'REMOVE_VIEW', viewId: `plugin:${viewType}` })
      }
    }

    // Also clean up any persisted plugin views that are not currently active
    // (handles case where layout was loaded from localStorage but plugin is no longer installed)
    if (currentViewTypes.size > 0 || prevViewTypes.size > 0) {
      for (const section of state.sections) {
        for (const viewId of section.viewIds) {
          if (isPluginViewId(viewId)) {
            const viewType = getPluginViewType(viewId)
            if (!currentViewTypes.has(viewType)) {
              dispatch({ type: 'REMOVE_VIEW', viewId })
            }
          }
        }
      }
    }

    prevPluginViewTypesRef.current = currentViewTypes
  }, [pluginViews, dispatch]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── Tab Switching ─────────────────────────────────────────────────────────

  const handleTabClick = useCallback((sectionId: string, viewId: PanelViewId) => {
    dispatch({ type: 'SET_ACTIVE_VIEW', sectionId, viewId })
  }, [dispatch])

  // ─── Tab Reordering ────────────────────────────────────────────────────────

  const handleTabReorder = useCallback((sectionId: string, newOrder: PanelViewId[]) => {
    dispatch({ type: 'SET_TAB_ORDER', sectionId, viewIds: newOrder })
  }, [dispatch])

  // ─── Tab Splitting ─────────────────────────────────────────────────────────

  const handleTabSplit = useCallback((viewId: PanelViewId) => {
    const targetIndex = state.sections.length
    dispatch({ type: 'SPLIT_VIEW', viewId, targetSectionIndex: targetIndex })
  }, [dispatch, state.sections.length])

  // ─── Tab Move (cross-section) ──────────────────────────────────────────────

  const handleTabMove = useCallback((viewId: PanelViewId, targetSectionId: string) => {
    dispatch({ type: 'MOVE_VIEW_TO_SECTION', viewId, targetSectionId })
  }, [dispatch])

  // ─── Section Resize ────────────────────────────────────────────────────────

  const handleResize = useCallback((heightFractions: number[]) => {
    dispatch({ type: 'RESIZE_SECTIONS', heightFractions })
  }, [dispatch])

  // ─── Render View ───────────────────────────────────────────────────────────

  const renderView = useCallback((viewId: PanelViewId) => {
    switch (viewId) {
      case 'explorer':
        return (
          <div className="side-panel__view-wrapper" key={viewId}>
            <h3 className="side-panel__view-header">Dateien</h3>
            <div className="side-panel__view-content">
              {renderExplorer()}
            </div>
          </div>
        )
      case 'favorites':
        return (
          <div className="side-panel__view-wrapper" key={viewId}>
            <h3 className="side-panel__view-header">Favoriten</h3>
            <div className="side-panel__view-content">
              <FavoritesView
                vaultId={vaultId}
                onOpenFile={onOpenFile}
                refreshKey={refreshKey}
                panelState={state}
                panelDispatch={dispatch}
              />
            </div>
          </div>
        )
      case 'recent':
        return (
          <div className="side-panel__view-wrapper" key={viewId}>
            <h3 className="side-panel__view-header">Zuletzt geöffnet</h3>
            <div className="side-panel__view-content">
              <RecentFilesView
                onOpenFile={onOpenFile}
                refreshKey={refreshKey}
              />
            </div>
          </div>
        )
      case 'outline':
        return (
          <div className="side-panel__view-wrapper" key={viewId}>
            <h3 className="side-panel__view-header">Gliederung</h3>
            <OutlineView
              headings={documentPanel.outline.headings}
              activeAnchor={documentPanel.outline.activeAnchor}
              onHeadingClick={documentPanel.onHeadingClick}
              hasDocument={documentPanel.hasDocument}
            />
          </div>
        )
      case 'links':
        return (
          <div className="side-panel__view-wrapper" key={viewId}>
            <h3 className="side-panel__view-header">Links</h3>
            <LinksView
              forwardLinks={documentPanel.links.forward}
              backlinks={documentPanel.links.backlinks}
              backlinksLoading={documentPanel.links.backlinksLoading}
              backlinksError={documentPanel.links.backlinksError}
              unlinkedMentions={documentPanel.links.unlinkedMentions}
              unlinkedMentionsLoading={documentPanel.links.unlinkedMentionsLoading}
              unlinkedMentionsError={documentPanel.links.unlinkedMentionsError}
              onLinkClick={documentPanel.onLinkClick}
              onUnlinkedMentionClick={documentPanel.onFileClick}
              onLinkMention={documentPanel.onLinkMention}
              hasDocument={documentPanel.hasDocument}
            />
          </div>
        )
      case 'tags':
        return (
          <div className="side-panel__view-wrapper" key={viewId}>
            <h3 className="side-panel__view-header">Tags</h3>
            <TagsView
              tags={documentPanel.tags.entries}
              loading={documentPanel.tags.loading}
              expandedTag={documentPanel.tags.expandedTag}
              tagFiles={documentPanel.tags.tagFiles}
              onTagClick={documentPanel.onTagClick}
              onFileClick={documentPanel.onFileClick}
            />
          </div>
        )
      case 'properties':
        return (
          <div className="side-panel__view-wrapper" key={viewId}>
            <h3 className="side-panel__view-header">Eigenschaften</h3>
            {documentPanel.canEditProperties ? (
              <PropertiesEditor
                data={documentPanel.properties.data}
                parseError={documentPanel.properties.parseError}
                rawFrontmatter={documentPanel.properties.rawFrontmatter}
                typeRegistry={documentPanel.properties.typeRegistry}
                onCommit={documentPanel.onPropertyCommit}
                onAddProperty={documentPanel.onPropertyAdd}
                onDeleteProperty={documentPanel.onPropertyDelete}
                tagSuggestions={documentPanel.tagSuggestions}
                propertySuggestions={documentPanel.properties.typeRegistry?.map((e) => e.key) ?? []}
                hasDocument={documentPanel.hasDocument}
              />
            ) : (
              <PropertiesView
                data={documentPanel.properties.data}
                parseError={documentPanel.properties.parseError}
                rawFrontmatter={documentPanel.properties.rawFrontmatter}
                hasDocument={documentPanel.hasDocument}
              />
            )}
          </div>
        )
      case 'search':
        return (
          <div className="side-panel__view-wrapper" key={viewId}>
            <h3 className="side-panel__view-header">Suche</h3>
            <SearchPanel
              vaults={search.vaults}
              selectedVaultId={search.selectedVaultId}
              hasWriteAccess={search.hasWriteAccess}
              onNavigateToResult={search.onNavigateToResult}
            />
          </div>
        )
    }

    // Plugin view: render container for imperative DOM mount
    if (isPluginViewId(viewId)) {
      const viewType = getPluginViewType(viewId)
      const viewInfo = pluginViews.get(viewType)
      if (!viewInfo) {
        return <div className="side-panel__plugin-section side-panel__plugin-section--empty" key={viewId} />
      }
      // Tracks which wrapper THIS ref callback instance itself mounted
      // containerEl into. A cross-panel move (see moveSidebarView) may
      // already have re-parented containerEl into the OTHER panel by the
      // time this instance's cleanup call runs — unconditionally removing it
      // from "whatever its current parent is" would rip it right back out
      // regardless of which side's mount/unmount race wins. Only detach if
      // it's still parented to the wrapper we ourselves attached it to.
      let mountedWrapper: HTMLElement | null = null
      return (
        <div
          className="side-panel__plugin-section"
          key={viewId}
          ref={(el) => {
            if (el) {
              mountedWrapper = el
              if (viewInfo && !el.contains(viewInfo.containerEl)) {
                el.innerHTML = ''
                el.appendChild(viewInfo.containerEl)
              }
            } else if (mountedWrapper && viewInfo.containerEl.parentElement === mountedWrapper) {
              mountedWrapper.removeChild(viewInfo.containerEl)
            }
          }}
        />
      )
    }

    return null
  }, [vaultId, onOpenFile, renderExplorer, refreshKey, state, dispatch, documentPanel, search, pluginViews])

  // ─── Single-Section Body Drop (split trigger) ──────────────────────────────

  const handleBodyDragOver = useCallback((e: React.DragEvent) => {
    if (state.sections.length !== 1) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [state.sections.length])

  const handleBodyDrop = useCallback((e: React.DragEvent) => {
    if (state.sections.length !== 1) return
    e.preventDefault()

    const viewId = e.dataTransfer.getData('text/plain') as PanelViewId
    if (viewId && state.sections[0]?.viewIds.includes(viewId)) {
      handleTabSplit(viewId)
    }
  }, [state.sections, handleTabSplit])

  // ─── Cross-Panel Drop (a view dragged in from the other side) ──────────────

  // Capture phase: PanelTabBar's own handleDrop calls stopPropagation()
  // unconditionally, so a bubble-phase handler here would never see a drop
  // that landed on a tab. Capture fires before any of that, and — once we
  // decide to handle it — stopPropagation() during capture prevents the
  // nested same-panel reorder/split logic from also running on the same drop.
  const handlePanelDropCapture = useCallback((e: React.DragEvent) => {
    const viewId = e.dataTransfer.getData('text/plain') as PanelViewId | ''
    if (!viewId) return
    if (state.tabOrder.includes(viewId)) return // already ours — let normal same-panel handling run
    e.preventDefault()
    e.stopPropagation()
    if (isPluginViewId(viewId)) {
      pluginContext?.moveSidebarView(getPluginViewType(viewId), side)
    } else {
      onMoveBuiltinView(viewId, side)
    }
  }, [state.tabOrder, pluginContext, onMoveBuiltinView, side])

  // ─── Render ────────────────────────────────────────────────────────────────

  const isSingleSection = state.sections.length === 1
  const pluginViewEntries = Array.from(pluginViews.values())

  // Build plugin view metadata map for the TabBar icon/label resolution
  const pluginViewMeta = new Map(pluginViewEntries.map(v => [v.viewType, {
    viewType: v.viewType,
    displayText: v.displayText,
    icon: v.icon,
  }]))

  return (
    <div className="side-panel" style={{ width }} onDropCapture={handlePanelDropCapture}>
      {/* Main TabBar — shown only in single-section mode */}
      {isSingleSection && state.sections[0] && (
        <PanelTabBar
          tabs={state.sections[0].viewIds}
          activeTab={state.sections[0].activeViewId}
          onTabClick={(viewId) => handleTabClick(state.sections[0]!.id, viewId)}
          onTabReorder={(newOrder) => handleTabReorder(state.sections[0]!.id, newOrder)}
          onTabSplit={handleTabSplit}
          panelWidth={width}
          pluginViewMeta={pluginViewMeta}
        />
      )}
      <div
        className="side-panel__body"
        ref={panelBodyRef}
        onDragOver={handleBodyDragOver}
        onDrop={handleBodyDrop}
      >
        {isSingleSection && state.sections[0] ? (
          <div className="side-panel__single-view">
            {renderView(state.sections[0].activeViewId)}
          </div>
        ) : (
          <PanelSplitContainer
            sections={state.sections}
            panelWidth={width}
            panelHeight={panelHeight}
            onTabClick={handleTabClick}
            onTabReorder={handleTabReorder}
            onTabSplit={handleTabSplit}
            onTabMove={handleTabMove}
            onResize={handleResize}
            renderView={renderView}
            pluginViewMeta={pluginViewMeta}
          />
        )}
      </div>
    </div>
  )
}
