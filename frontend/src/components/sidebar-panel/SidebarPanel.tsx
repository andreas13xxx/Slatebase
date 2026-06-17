/**
 * Main SidebarPanel component.
 *
 * Orchestrates the left-side tabbed panel containing File Explorer, Favorites, and Recent Files.
 * Supports tab reordering via drag-and-drop and splitting into multiple sections.
 * Mirrors the Context Panel architecture for consistent UX.
 */

import { useCallback, useState, useRef, useEffect } from 'react'
import { useSidebarPanelContext } from '../../state/sidebarPanelContext'
import { SidebarPanelTabBar } from './SidebarPanelTabBar'
import { SidebarSplitContainer } from './SidebarSplitContainer'
import { FavoritesView } from './FavoritesView'
import { RecentFilesView } from './RecentFilesView'
import type { SidebarViewId } from '../../state/sidebarPanelState'
import './SidebarPanel.css'

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SidebarPanelProps {
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
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SidebarPanel({ width, vaultId, onOpenFile, renderExplorer, refreshKey }: SidebarPanelProps) {
  const { state, dispatch } = useSidebarPanelContext()
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

  // ─── Tab Switching ─────────────────────────────────────────────────────────

  const handleTabClick = useCallback((sectionId: string, viewId: SidebarViewId) => {
    dispatch({ type: 'SET_ACTIVE_VIEW', sectionId, viewId })
  }, [dispatch])

  // ─── Tab Reordering ────────────────────────────────────────────────────────

  const handleTabReorder = useCallback((_sectionId: string, newOrder: SidebarViewId[]) => {
    dispatch({ type: 'SET_TAB_ORDER', tabOrder: newOrder })
  }, [dispatch])

  // ─── Tab Splitting ─────────────────────────────────────────────────────────

  const handleTabSplit = useCallback((viewId: SidebarViewId) => {
    const targetIndex = state.sections.length
    dispatch({ type: 'SPLIT_VIEW', viewId, targetSectionIndex: targetIndex })
  }, [dispatch, state.sections.length])

  // ─── Tab Move (cross-section) ──────────────────────────────────────────────

  const handleTabMove = useCallback((viewId: SidebarViewId, targetSectionId: string) => {
    dispatch({ type: 'MOVE_VIEW_TO_SECTION', viewId, targetSectionId })
  }, [dispatch])

  // ─── Section Resize ────────────────────────────────────────────────────────

  const handleResize = useCallback((heightFractions: number[]) => {
    dispatch({ type: 'RESIZE_SECTIONS', heightFractions })
  }, [dispatch])

  // ─── Render View ───────────────────────────────────────────────────────────

  const renderView = useCallback((viewId: SidebarViewId) => {
    switch (viewId) {
      case 'explorer':
        return (
          <div className="sidebar-panel__view-wrapper">
            <h3 className="sidebar-panel__view-header">Dateien</h3>
            <div className="sidebar-panel__view-content">
              {renderExplorer()}
            </div>
          </div>
        )
      case 'favorites':
        return (
          <div className="sidebar-panel__view-wrapper">
            <h3 className="sidebar-panel__view-header">Favoriten</h3>
            <div className="sidebar-panel__view-content">
              <FavoritesView
                vaultId={vaultId}
                onOpenFile={onOpenFile}
                refreshKey={refreshKey}
              />
            </div>
          </div>
        )
      case 'recent':
        return (
          <div className="sidebar-panel__view-wrapper">
            <h3 className="sidebar-panel__view-header">Zuletzt geöffnet</h3>
            <div className="sidebar-panel__view-content">
              <RecentFilesView
                onOpenFile={onOpenFile}
                refreshKey={refreshKey}
              />
            </div>
          </div>
        )
    }
  }, [vaultId, onOpenFile, renderExplorer, refreshKey])

  // ─── Single-Section Body Drop (split trigger) ──────────────────────────────

  const handleBodyDragOver = useCallback((e: React.DragEvent) => {
    if (state.sections.length !== 1) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [state.sections.length])

  const handleBodyDrop = useCallback((e: React.DragEvent) => {
    if (state.sections.length !== 1) return
    e.preventDefault()

    const viewId = e.dataTransfer.getData('text/plain') as SidebarViewId
    if (viewId && state.sections[0]?.viewIds.includes(viewId)) {
      handleTabSplit(viewId)
    }
  }, [state.sections, handleTabSplit])

  // ─── Render ────────────────────────────────────────────────────────────────

  const isSingleSection = state.sections.length === 1

  return (
    <div className="sidebar-panel" style={{ width }}>
      {/* Main TabBar — shown only in single-section mode */}
      {isSingleSection && state.sections[0] && (
        <SidebarPanelTabBar
          tabs={state.sections[0].viewIds}
          activeTab={state.sections[0].activeViewId}
          onTabClick={(viewId) => handleTabClick(state.sections[0]!.id, viewId)}
          onTabReorder={(newOrder) => handleTabReorder(state.sections[0]!.id, newOrder)}
          onTabSplit={handleTabSplit}
          panelWidth={width}
        />
      )}
      <div
        className="sidebar-panel__body"
        ref={panelBodyRef}
        onDragOver={handleBodyDragOver}
        onDrop={handleBodyDrop}
      >
        {isSingleSection && state.sections[0] ? (
          <div className="sidebar-panel__single-view">
            {renderView(state.sections[0].activeViewId)}
          </div>
        ) : (
          <SidebarSplitContainer
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
