/**
 * CanvasToolbar — Enhanced toolbar for the canvas editor.
 * Provides: add objects, zoom controls, undo/redo, fit view, grid/minimap toggles, save.
 */

import { useTranslation } from '../../i18n'
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
  const { t } = useTranslation()

  return (
    <div className="canvas-toolbar">
      {/* Add Objects Group */}
      {!readOnly && viewMode === 'visual' && (
        <div className="canvas-toolbar__group">
          <span className="canvas-toolbar__group-label">{t('canvasUi.add')}</span>
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onAddText}
            title={t('canvasUi.textNodeTitle')}
            aria-label={t('canvasUi.addTextNode')}
          >
            <Type size={14} />
          </button>
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onAddFile}
            title={t('canvasUi.fileNodeTitle')}
            aria-label={t('canvasUi.addFileNode')}
          >
            <FileText size={14} />
          </button>
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onAddLink}
            title={t('canvasUi.linkNodeTitle')}
            aria-label={t('canvasUi.addLinkNode')}
          >
            <Link2 size={14} />
          </button>
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onAddGroup}
            title={t('canvasUi.groupTitle')}
            aria-label={t('canvasUi.addGroup')}
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
            title={t('canvasUi.undoTitle')}
            aria-label={t('canvasUi.undo')}
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            className="canvas-toolbar__btn"
            onClick={onRedo}
            disabled={!canRedo}
            title={t('canvasUi.redoTitle')}
            aria-label={t('canvasUi.redo')}
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
          title={t('canvasUi.zoomOutTitle')}
          aria-label={t('canvasUi.zoomOut')}
        >
          <ZoomOut size={14} />
        </button>
        <span className="canvas-toolbar__zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="canvas-toolbar__btn"
          onClick={onZoomIn}
          title={t('canvasUi.zoomInTitle')}
          aria-label={t('canvasUi.zoomIn')}
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="canvas-toolbar__btn"
          onClick={onFitView}
          title={t('canvasUi.fitView')}
          aria-label={t('canvasUi.fitView')}
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
          title={t('canvasUi.toggleGrid')}
          aria-label={t('canvasUi.toggleGrid')}
          aria-pressed={showGrid}
        >
          <Grid3X3 size={14} />
        </button>
        <button
          type="button"
          className={`canvas-toolbar__btn ${showMinimap ? 'canvas-toolbar__btn--active' : ''}`}
          onClick={onToggleMinimap}
          title={t('canvasUi.toggleMinimap')}
          aria-label={t('canvasUi.toggleMinimap')}
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
          title={t('canvasUi.visualMode')}
          aria-label={t('canvasUi.visualMode')}
          aria-pressed={viewMode === 'visual'}
        >
          <Eye size={14} />
        </button>
        <button
          type="button"
          className={`canvas-toolbar__btn ${viewMode === 'source' ? 'canvas-toolbar__btn--active' : ''}`}
          onClick={() => onSetViewMode('source')}
          title={t('canvasUi.sourceMode')}
          aria-label={t('canvasUi.sourceMode')}
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
            title={t('canvasUi.saveTitle')}
            aria-label={t('canvasUi.save')}
          >
            <Save size={14} />
          </button>
        </div>
      )}

      {/* Status Indicators */}
      {dirty && <span className="canvas-toolbar__dirty" title={t('canvasUi.unsaved')}>●</span>}
      {readOnly && <span className="canvas-toolbar__badge">{t('canvasUi.readOnly')}</span>}
    </div>
  )
})
