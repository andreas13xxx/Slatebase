/**
 * CanvasToolbar — Enhanced toolbar for the canvas editor.
 * Provides: add objects, zoom controls, undo/redo, fit view, grid/minimap toggles, save.
 */

import { memo } from 'react'
import {
  Type, FileText, Link2, SquareDashed,
  ZoomIn, ZoomOut, Maximize, Grid3X3, Map,
  Undo2, Redo2, Save, Code, Eye,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CanvasViewMode = 'visual' | 'source'

export interface CanvasToolbarProps {
  /** Current zoom percentage (0.1 to 4.0). */
  zoom: number
  /** Whether the canvas has unsaved changes. */
  dirty: boolean
  /** Whether the canvas is read-only. */
  readOnly: boolean
  /** Whether grid is visible. */
  showGrid: boolean
  /** Whether minimap is visible. */
  showMinimap: boolean
  /** Whether undo is available. */
  canUndo: boolean
  /** Whether redo is available. */
  canRedo: boolean
  /** Current view mode (visual or source). */
  viewMode: CanvasViewMode
  /** Callbacks. */
  onAddText: () => void
  onAddFile: () => void
  onAddLink: () => void
  onAddGroup: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFitView: () => void
  onToggleGrid: () => void
  onToggleMinimap: () => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onSetViewMode: (mode: CanvasViewMode) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export const CanvasToolbar = memo(function CanvasToolbar({
  zoom, dirty, readOnly, showGrid, showMinimap, canUndo, canRedo, viewMode,
  onAddText, onAddFile, onAddLink, onAddGroup,
  onZoomIn, onZoomOut, onFitView, onToggleGrid, onToggleMinimap,
  onUndo, onRedo, onSave, onSetViewMode,
}: CanvasToolbarProps) {

  return (
    <div className="canvas-toolbar">
      {/* Add Objects Group */}
      {!readOnly && viewMode === 'visual' && (
        <div className="canvas-toolbar__group">
          <span className="canvas-toolbar__group-label">Hinzufügen</span>
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onAddText}
            title="Textknoten (T)"
            aria-label="Textknoten hinzufügen"
          >
            <Type size={14} />
          </button>
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onAddFile}
            title="Dateiknoten (F)"
            aria-label="Dateiknoten hinzufügen"
          >
            <FileText size={14} />
          </button>
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onAddLink}
            title="Linkknoten (L)"
            aria-label="Linkknoten hinzufügen"
          >
            <Link2 size={14} />
          </button>
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onAddGroup}
            title="Gruppe (G)"
            aria-label="Gruppe hinzufügen"
          >
            <SquareDashed size={14} />
          </button>
        </div>
      )}

      {/* Separator */}
      {!readOnly && viewMode === 'visual' && <div className="canvas-toolbar__separator" />}

      {/* Undo/Redo Group */}
      {!readOnly && (
        <div className="canvas-toolbar__group">
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Rückgängig (Ctrl+Z)"
            aria-label="Rückgängig"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Wiederherstellen (Ctrl+Shift+Z)"
            aria-label="Wiederherstellen"
          >
            <Redo2 size={14} />
          </button>
        </div>
      )}

      {/* Separator */}
      {!readOnly && <div className="canvas-toolbar__separator" />}

      {/* Zoom Group */}
      <div className="canvas-toolbar__group">
        <button
          type="button"
          className="canvas-toolbar__btn"
          onClick={onZoomOut}
          title="Herauszoomen (–)"
          aria-label="Herauszoomen"
        >
          <ZoomOut size={14} />
        </button>
        <span className="canvas-toolbar__zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="canvas-toolbar__btn"
          onClick={onZoomIn}
          title="Hineinzoomen (+)"
          aria-label="Hineinzoomen"
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="canvas-toolbar__btn"
          onClick={onFitView}
          title="Alles einpassen"
          aria-label="Alles einpassen"
        >
          <Maximize size={14} />
        </button>
      </div>

      {/* Separator */}
      <div className="canvas-toolbar__separator" />

      {/* View Toggles */}
      <div className="canvas-toolbar__group">
        <button
          type="button"
          className={`canvas-toolbar__btn ${showGrid ? 'canvas-toolbar__btn--active' : ''}`}
          onClick={onToggleGrid}
          title="Raster ein/aus"
          aria-label="Raster ein/aus"
          aria-pressed={showGrid}
        >
          <Grid3X3 size={14} />
        </button>
        <button
          type="button"
          className={`canvas-toolbar__btn ${showMinimap ? 'canvas-toolbar__btn--active' : ''}`}
          onClick={onToggleMinimap}
          title="Minimap ein/aus"
          aria-label="Minimap ein/aus"
          aria-pressed={showMinimap}
        >
          <Map size={14} />
        </button>
      </div>

      {/* Separator */}
      <div className="canvas-toolbar__separator" />

      {/* View Mode Toggle */}
      <div className="canvas-toolbar__group">
        <button
          type="button"
          className={`canvas-toolbar__btn ${viewMode === 'visual' ? 'canvas-toolbar__btn--active' : ''}`}
          onClick={() => onSetViewMode('visual')}
          title="Visueller Modus"
          aria-label="Visueller Modus"
          aria-pressed={viewMode === 'visual'}
        >
          <Eye size={14} />
        </button>
        <button
          type="button"
          className={`canvas-toolbar__btn ${viewMode === 'source' ? 'canvas-toolbar__btn--active' : ''}`}
          onClick={() => onSetViewMode('source')}
          title="Quelltext-Modus"
          aria-label="Quelltext-Modus"
          aria-pressed={viewMode === 'source'}
        >
          <Code size={14} />
        </button>
      </div>

      {/* Right-aligned: Save + Status */}
      <div className="canvas-toolbar__spacer" />

      {!readOnly && (
        <div className="canvas-toolbar__group">
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onSave}
            disabled={!dirty}
            title="Speichern (Ctrl+S)"
            aria-label="Speichern"
          >
            <Save size={14} />
          </button>
        </div>
      )}

      {/* Status Indicators */}
      {dirty && <span className="canvas-toolbar__dirty" title="Ungespeicherte Änderungen">●</span>}
      {readOnly && <span className="canvas-toolbar__badge">Nur Lesen</span>}
    </div>
  )
})
