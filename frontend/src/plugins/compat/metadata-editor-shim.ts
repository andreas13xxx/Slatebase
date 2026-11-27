/**
 * `MarkdownView.metadataEditor` — Obsidian's handle on the properties block of a note.
 * Plugins read the frontmatter with `serialize()`, push a changed one back with
 * `synchronize(data)` and look at the drawn rows through `rendered` (each with the
 * row's element, its live `entry` and `renderProperty`). Here it is bound to the real
 * editor: `synchronize` writes the document, and the rows are the ones the property
 * editor registered in `metadata-editor-bridge.ts`.
 */

import type { EditorView } from '@codemirror/view'
import { getActiveEditorView } from '../../editor/plugin-extensions'
import { editorInfoField } from '../../editor/editor-state-fields'
import { commitFrontmatterData } from '../../editor/frontmatter-commit'
import { parseFrontmatter } from '../../components/context-panel/utils/parseFrontmatter'
import { applyFrontmatterChange } from '../../utils/frontmatterWriter'
import { getRenderedProperties, type RenderedProperty } from './metadata-editor-bridge'
import { warnOnce } from './log'

/** The part of a MarkdownView the metadata editor needs. */
export interface MetadataEditorHost {
  file?: { path: string } | null
  getViewData(): string
  setViewData(data: string, clear?: boolean): void
}

/** The editor showing this note, when it is the active one. */
function editorViewFor(path: string): EditorView | null {
  const view = getActiveEditorView()
  if (!view) return null
  return view.state.field(editorInfoField, false)?.file?.path === path ? view : null
}

/** Builds the `metadataEditor` object for one markdown view. */
export function createMetadataEditorShim(host: MetadataEditorHost) {
  const pathOf = (): string => host.file?.path ?? ''
  const currentContent = (): string => editorViewFor(pathOf())?.state.doc.toString() ?? host.getViewData()

  return {
    /** The rows currently drawn for this note. */
    get rendered(): RenderedProperty[] {
      return getRenderedProperties(pathOf())
    },

    /** The properties block's element, or null while the note shows its frontmatter as raw text. */
    get containerEl(): HTMLElement | null {
      return this.rendered[0]?.containerEl.closest<HTMLElement>('.metadata-container') ?? null
    },

    /** A copy of the note's frontmatter as data. */
    serialize(): Record<string, unknown> {
      const data = parseFrontmatter(currentContent()).data ?? {}
      return structuredClone(data)
    },

    /** Makes `data` the note's frontmatter: writes it into the document and redraws the rows. */
    synchronize(data: Record<string, unknown>): void {
      const view = editorViewFor(pathOf())
      if (!view) {
        // No live editor for this note (another tab is active): change the view's text instead.
        warnOnce('metadata-editor-inactive', '[PluginCompat] metadataEditor.synchronize() on a note that is not the active editor changes its text only; rows are not redrawn.')
        host.setViewData(applyFrontmatterChange(host.getViewData(), data))
        return
      }
      const current = parseFrontmatter(view.state.doc.toString()).data ?? {}
      if (JSON.stringify(current) === JSON.stringify(data)) {
        // Nothing to write, but the caller asked for a fresh display.
        for (const row of getRenderedProperties(pathOf())) row.renderProperty(row.entry, true)
        return
      }
      commitFrontmatterData(view, data)
    },
  }
}
