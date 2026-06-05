/**
 * PluginViewPanel — Renders active plugin views (ItemView) in the right panel.
 *
 * When plugins register and activate views (e.g., Calendar, Kanban), their DOM
 * containers are mounted here. Multiple views are shown as tabs.
 *
 * @module PluginViewPanel
 */

import { useEffect, useRef, useContext } from 'react'
import { PluginContext } from '../plugins/compat/plugin-context'

export interface PluginViewPanelProps {
  /** Currently selected view type to display (when multiple views exist) */
  activeViewType?: string
}

/**
 * PluginViewPanel — Mounts plugin view DOM elements into React.
 *
 * Each active plugin view has a `containerEl` (DOM element populated by the plugin).
 * This component mounts that element into the React tree via a ref.
 */
export function PluginViewPanel({ activeViewType }: PluginViewPanelProps) {
  const pluginContext = useContext(PluginContext)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeViews = pluginContext?.activeViews ?? new Map()

  // Determine which view to show
  const viewToShow = activeViewType
    ? activeViews.get(activeViewType)
    : activeViews.size > 0
      ? [...activeViews.values()][0]
      : undefined

  useEffect(() => {
    if (!containerRef.current) return

    if (!viewToShow) {
      containerRef.current.innerHTML = ''
      return
    }

    // Mount the plugin's DOM element
    containerRef.current.innerHTML = ''
    containerRef.current.appendChild(viewToShow.containerEl)

    return () => {
      // Don't destroy the element — the plugin owns it
      // Just remove it from our container
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [viewToShow])

  // Don't render anything if no views are active
  if (activeViews.size === 0) {
    return null
  }

  return (
    <div className="plugin-view-panel">
      {activeViews.size > 1 && (
        <div className="plugin-view-tabs">
          {[...activeViews.values()].map(v => (
            <span key={v.viewType} className="plugin-view-tab-label">
              {v.displayText}
            </span>
          ))}
        </div>
      )}
      <div className="plugin-view-mount" ref={containerRef} />
    </div>
  )
}
