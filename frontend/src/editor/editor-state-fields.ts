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
 *
 * These fields MUST be part of the EditorState extensions so that plugins can
 * call `view.state.field(editorInfoField)` without crashing.
 *
 * @module editor-state-fields
 */

import { StateField, StateEffect } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

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
