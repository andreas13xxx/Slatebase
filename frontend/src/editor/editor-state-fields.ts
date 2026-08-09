/**
 * Obsidian-compatible EditorState fields.
 *
 * Obsidian exports three StateFields that plugins can use to access editor context
 * from within CM6 extensions (ViewPlugins, StateFields, etc.):
 *
 * - `editorInfoField` — MarkdownFileInfo (app, file, editor)
 * - `editorEditorField` — reference to the EditorView
 * - `editorLivePreviewField` — whether Live Preview is active
 * - `editorViewField` — deprecated alias for editorInfoField
 * - `livePreviewState` — transient editor interaction state (`{ mousedown }`)
 *
 * These fields MUST be part of the EditorState extensions so that plugins can
 * call `view.state.field(editorInfoField)` without crashing.
 *
 * @module editor-state-fields
 */

import { StateField, StateEffect, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Minimal MarkdownFileInfo interface matching Obsidian's public API. */
export interface EditorFileInfo {
  app: unknown
  file: { path: string; basename: string; extension: string; name: string } | null
  editor?: unknown
}

// ─── State Effects (for updating field values) ───────────────────────────────

/** Effect to update the editorInfoField value. */
export const setEditorInfo = StateEffect.define<EditorFileInfo>()

/** Effect to update the editorEditorField value (EditorView reference). */
export const setEditorEditor = StateEffect.define<EditorView | null>()

/** Effect to update the editorLivePreviewField value. */
export const setEditorLivePreview = StateEffect.define<boolean>()

// ─── State Fields ────────────────────────────────────────────────────────────

/**
 * StateField providing MarkdownFileInfo to CM6 extensions.
 * Plugins read this via `view.state.field(editorInfoField)` to get
 * the associated file and editor instance.
 */
export const editorInfoField = StateField.define<EditorFileInfo>({
  create() {
    return { app: null, file: null, editor: undefined }
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setEditorInfo)) {
        return effect.value
      }
    }
    return value
  },
})

/**
 * StateField providing a reference to the EditorView.
 * Plugins read this via `view.state.field(editorEditorField)`.
 */
export const editorEditorField = StateField.define<EditorView | null>({
  create() {
    return null
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setEditorEditor)) {
        return effect.value
      }
    }
    return value
  },
})

/**
 * StateField indicating whether Live Preview mode is active.
 * Plugins read this via `view.state.field(editorLivePreviewField)`.
 */
export const editorLivePreviewField = StateField.define<boolean>({
  create() {
    return false
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setEditorLivePreview)) {
        return effect.value
      }
    }
    return value
  },
})

/**
 * Deprecated alias for editorInfoField (Obsidian compat).
 * Some older plugins import `editorViewField` instead of `editorInfoField`.
 */
export const editorViewField = editorInfoField

// ─── livePreviewState ────────────────────────────────────────────────────────

/** Transient editor interaction state, as exposed by Obsidian's `livePreviewState`. */
export interface LivePreviewState {
  /** True while a mouse button is held down over the editor. */
  mousedown: boolean
}

/** Effect to update {@link livePreviewState}. */
export const setLivePreviewMousedown = StateEffect.define<boolean>()

/**
 * StateField mirroring Obsidian's `livePreviewState`.
 *
 * Widget-rendering plugins read `view.state.field(livePreviewState).mousedown`
 * to suppress re-rendering while the user is dragging a selection — replacing a
 * widget mid-drag collapses the selection and makes text unselectable. Obsidian
 * only ever populates `mousedown`, so that is the whole shape.
 */
export const livePreviewState = StateField.define<LivePreviewState>({
  create() {
    return { mousedown: false }
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLivePreviewMousedown) && effect.value !== value.mousedown) {
        return { mousedown: effect.value }
      }
    }
    return value
  },
})

/**
 * Keeps {@link livePreviewState} in sync with the pointer.
 *
 * `mouseup` is listened for on the document rather than the editor: a drag
 * started inside the editor very often ends outside it, and a `mousedown` that
 * never cleared would freeze every widget on the page.
 */
export const livePreviewStateTracker: Extension = [
  livePreviewState,
  EditorView.domEventHandlers({
    mousedown(_event, view) {
      view.dispatch({ effects: setLivePreviewMousedown.of(true) })
      return false
    },
  }),
  ViewPlugin.fromClass(
    class {
      private readonly view: EditorView

      private readonly onMouseUp = (): void => {
        if (!this.view.state.field(livePreviewState, false)?.mousedown) return
        this.view.dispatch({ effects: setLivePreviewMousedown.of(false) })
      }

      constructor(view: EditorView) {
        this.view = view
        document.addEventListener('mouseup', this.onMouseUp, true)
      }

      destroy(): void {
        document.removeEventListener('mouseup', this.onMouseUp, true)
      }
    },
  ),
]
