/**
 * MarkdownViewShim — Obsidian-compatible MarkdownView stub.
 *
 * Plugins use `workspace.getActiveViewOfType(MarkdownView)` to access the active
 * editor and its associated file. This stub provides just enough to satisfy that pattern:
 * - `editor` property returning the EditorShim instance
 * - `file` property returning the active TFile
 * - `getViewType()` returning 'markdown'
 * - `getMode()` returning 'source' | 'preview'
 *
 * This class is registered on `window.obsidian.MarkdownView` so `instanceof` checks work.
 *
 * @module markdown-view-shim
 */

import type { IEditor } from '../editor-shim'
import type { TFile } from '../types'
import { getActiveEditorContainerEl } from '../../../editor/plugin-extensions'

/**
 * MarkdownView — Obsidian-compatible MarkdownView emulation.
 *
 * Not a full view implementation — just enough for plugins to retrieve
 * the editor and file via the standard Obsidian pattern.
 */
export class MarkdownView {
  /** The editor instance for the current file. */
  editor: IEditor

  /** The file currently open in this view. */
  file: TFile | null

  /** Content element (stub for DOM operations). */
  contentEl: HTMLElement

  /** Container element (stub). */
  containerEl: HTMLElement

  /** Preview mode stub. */
  previewMode: { rerender: () => void }

  /** Current sub-view mode. */
  currentMode: { get: () => string; set: (data: string, clear: boolean) => void }

  constructor(editor: IEditor, file: TFile | null) {
    this.editor = editor
    this.file = file
    this.contentEl = document.createElement('div')
    // Point at the real, attached DOM node hosting the CM6 editor when one is
    // mounted, so plugins that query containerEl for an insertion point (e.g.
    // Editing Toolbar's `.markdown-source-view` lookup) can actually find it.
    // Falls back to a detached div when no editor is mounted (e.g. no file open).
    this.containerEl = getActiveEditorContainerEl() ?? document.createElement('div')
    this.previewMode = { rerender: () => {} }
    this.currentMode = {
      get: () => '',
      set: () => {},
    }
  }

  /** Returns the view type identifier. */
  getViewType(): string {
    return 'markdown'
  }

  /** Returns the display text for the tab. */
  getDisplayText(): string {
    return this.file?.basename ?? 'Markdown'
  }

  /** Returns the current editor mode. */
  getMode(): 'source' | 'preview' {
    return 'source'
  }

  /** Get the raw view data (file content). */
  getViewData(): string {
    return this.editor.getValue()
  }

  /** Clear the view state. */
  clear(): void {
    // No-op
  }

  /** Set the view data. */
  setViewData(data: string, _clear: boolean): void {
    this.editor.setValue(data)
  }

  /** Show the search bar. No-op in Slatebase. */
  showSearch(_replace?: boolean): void {
    // No-op — Slatebase has its own search panel
  }
}

/**
 * MarkdownFileInfo — Minimal interface for `workspace.activeEditor`.
 * Obsidian returns this from `editorInfoField` and `workspace.activeEditor`.
 */
export interface MarkdownFileInfo {
  app: unknown
  file: TFile | null
  editor?: IEditor
}

/**
 * Register the MarkdownView class on window.obsidian so that
 * `instanceof MarkdownView` checks work in plugins.
 */
export function registerMarkdownViewGlobal(): void {
  const obsidian = (window as unknown as { obsidian?: Record<string, unknown> }).obsidian
  if (obsidian) {
    obsidian.MarkdownView = MarkdownView
    // Also register MarkdownFileInfo-related types used by editorCallback
    if (!obsidian.MarkdownEditView) {
      obsidian.MarkdownEditView = MarkdownView
    }
  }
}
