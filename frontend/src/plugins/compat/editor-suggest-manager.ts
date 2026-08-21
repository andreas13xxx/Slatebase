/**
 * EditorSuggestManager — Central registry and lifecycle for EditorSuggest instances.
 *
 * Obsidian's EditorSuggest system:
 * 1. Plugins register EditorSuggest subclasses via `plugin.registerEditorSuggest(suggest)`
 * 2. On every cursor move / document change, each registered suggest's `onTrigger()` is called
 * 3. First non-null trigger wins → `getSuggestions(context)` is called
 * 4. Items are rendered in a positioned popover via `renderSuggestion()`
 * 5. User picks one → `selectSuggestion()` handles the insertion
 *
 * This module is a vault-scoped singleton (reset on vault switch).
 *
 * @module editor-suggest-manager
 */

import type { EditorView } from '@codemirror/view'
import type { EditorPosition, IEditor } from './editor-shim.js'
import type { TFile } from './types.js'
import { EditorSuggestPopover } from './editor-suggest-popover.js'

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * The trigger info returned by `onTrigger()`.
 * Matches Obsidian's `EditorSuggestTriggerInfo`.
 */
export interface EditorSuggestTriggerInfo {
  start: EditorPosition
  end: EditorPosition
  query: string
}

/**
 * The context passed to `getSuggestions()`.
 * Matches Obsidian's `EditorSuggestContext`.
 */
export interface EditorSuggestContext extends EditorSuggestTriggerInfo {
  editor: IEditor
  file: TFile
}

/**
 * The interface an EditorSuggest instance must satisfy.
 * Plugins subclass EditorSuggest and override these methods.
 */
export interface EditorSuggestInstance {
  context: EditorSuggestContext | null
  limit: number
  onTrigger(cursor: EditorPosition, editor: IEditor, file: TFile | null): EditorSuggestTriggerInfo | null
  getSuggestions(context: EditorSuggestContext): unknown[] | Promise<unknown[]>
  renderSuggestion(value: unknown, el: HTMLElement): void
  selectSuggestion(value: unknown, evt: MouseEvent | KeyboardEvent): void
  close(): void
  open(): void
}

/**
 * Dependencies injected into the manager (avoids circular imports).
 */
export interface EditorSuggestManagerDeps {
  /** Get the active CM6 EditorView (for coordsAtPos). */
  getActiveEditorView: () => EditorView | null
  /** Get an EditorShim instance for the current editor. */
  getEditor: () => IEditor | null
  /** Get the active TFile (from workspace). */
  getActiveFile: () => TFile | null
}

// ─── Manager ───────────────────────────────────────────────────────────────────

/**
 * EditorSuggestManager — Singleton per vault that drives the EditorSuggest lifecycle.
 */
export class EditorSuggestManager {
  private suggests: EditorSuggestInstance[] = []
  private activeSuggest: EditorSuggestInstance | null = null
  private items: unknown[] = []
  private selectedIndex = 0
  private generation = 0
  private popover: EditorSuggestPopover
  private deps: EditorSuggestManagerDeps
  private destroyed = false

  constructor(deps: EditorSuggestManagerDeps) {
    this.deps = deps
    this.popover = new EditorSuggestPopover({
      onSelect: (index, evt) => this.confirmSelectionAt(index, evt),
      onHover: (index) => this.setSelectedIndex(index),
    })
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Register a new EditorSuggest instance. */
  register(suggest: EditorSuggestInstance): void {
    if (this.destroyed) return
    if (!this.suggests.includes(suggest)) {
      this.suggests.push(suggest)
    }
  }

  /** Unregister an EditorSuggest instance. */
  unregister(suggest: EditorSuggestInstance): void {
    const idx = this.suggests.indexOf(suggest)
    if (idx !== -1) {
      this.suggests.splice(idx, 1)
    }
    // If the active suggest was unregistered, close
    if (this.activeSuggest === suggest) {
      this.close()
    }
  }

  /** Whether the suggest popover is currently open. */
  isOpen(): boolean {
    return this.activeSuggest !== null
  }

  /** Get the count of registered suggests (for extension registration check). */
  get count(): number {
    return this.suggests.length
  }

  /**
   * Called from the CM6 ViewPlugin on every transaction with cursor/doc change.
   * This is the main trigger detection loop.
   */
  handleUpdate(view: EditorView): void {
    if (this.destroyed || this.suggests.length === 0) return

    const editor = this.deps.getEditor()
    if (!editor) return

    const file = this.deps.getActiveFile()
    const cursor = editor.getCursor()

    // If a suggest is currently active, check if we should update or close
    if (this.activeSuggest) {
      const context = this.activeSuggest.context
      if (context) {
        // Context is still valid if cursor is within or at the end of the trigger range
        const cursorOffset = editor.posToOffset(cursor)
        const startOffset = editor.posToOffset(context.start)

        if (cursorOffset < startOffset) {
          // Cursor moved before the trigger start → close
          this.close()
        } else {
          // Re-trigger: call onTrigger again to see if context changed
          const newTrigger = this.activeSuggest.onTrigger(cursor, editor, file)
          if (newTrigger === null) {
            this.close()
          } else {
            // Update context and re-fetch suggestions
            const newContext: EditorSuggestContext = {
              ...newTrigger,
              editor,
              file: file!,
            }
            this.activeSuggest.context = newContext
            void this.fetchSuggestions(this.activeSuggest, newContext, view)
          }
          return
        }
      }
    }

    // No active suggest — check all registered suggests
    for (const suggest of this.suggests) {
      const triggerInfo = suggest.onTrigger(cursor, editor, file)
      if (triggerInfo !== null) {
        // Build context
        const context: EditorSuggestContext = {
          ...triggerInfo,
          editor,
          file: file!,
        }
        suggest.context = context
        this.activeSuggest = suggest
        void this.fetchSuggestions(suggest, context, view)
        return
      }
    }
  }

  /** Move selection up or down. */
  moveSelection(direction: 1 | -1): boolean {
    if (!this.isOpen() || this.items.length === 0) return false
    const count = this.items.length
    this.selectedIndex = (this.selectedIndex + direction + count) % count
    this.popover.setSelectedIndex(this.selectedIndex)
    return true
  }

  /** Confirm the currently selected suggestion. */
  confirmSelection(evt: KeyboardEvent | MouseEvent): boolean {
    if (!this.isOpen() || this.items.length === 0) return false
    this.confirmSelectionAt(this.selectedIndex, evt)
    return true
  }

  /** Close the active suggest popover. */
  close(): void {
    if (this.activeSuggest) {
      this.activeSuggest.context = null
      this.activeSuggest = null
    }
    this.items = []
    this.selectedIndex = 0
    this.generation++
    this.popover.hide()
  }

  /** Full cleanup on vault switch. */
  destroy(): void {
    this.close()
    this.suggests = []
    this.destroyed = true
    this.popover.destroy()
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private confirmSelectionAt(index: number, evt: KeyboardEvent | MouseEvent): void {
    if (!this.activeSuggest || index < 0 || index >= this.items.length) return
    const item = this.items[index]
    const suggest = this.activeSuggest
    // Close BEFORE selectSuggestion — the plugin's handler may trigger editor
    // changes that would re-fire handleUpdate, and we don't want the old context
    // to interfere.
    this.close()
    suggest.selectSuggestion(item, evt)
  }

  private setSelectedIndex(index: number): void {
    if (index >= 0 && index < this.items.length) {
      this.selectedIndex = index
      this.popover.setSelectedIndex(index)
    }
  }

  /**
   * Fetch suggestions from the active suggest (handles sync + async).
   * Uses a generation counter to discard stale async results.
   */
  private async fetchSuggestions(
    suggest: EditorSuggestInstance,
    context: EditorSuggestContext,
    view: EditorView,
  ): Promise<void> {
    const gen = ++this.generation

    try {
      const result = suggest.getSuggestions(context)
      let items: unknown[]

      if (result instanceof Promise) {
        items = await result
      } else {
        items = result
      }

      // Stale check: if generation changed, a newer trigger superseded us
      if (gen !== this.generation) return
      // The suggest may have been closed/unregistered while we awaited
      if (this.activeSuggest !== suggest) return

      // Apply limit
      const limit = suggest.limit > 0 ? suggest.limit : 20
      this.items = items.slice(0, limit)
      this.selectedIndex = 0

      if (this.items.length === 0) {
        this.popover.hide()
        return
      }

      // Render and show
      this.popover.render(this.items, suggest, view, context.start)
      this.popover.setSelectedIndex(0)
    } catch (err) {
      console.error('[EditorSuggestManager] Error in getSuggestions:', err)
      if (gen === this.generation) {
        this.close()
      }
    }
  }
}

// ─── Module-Level Singleton ────────────────────────────────────────────────────

let instance: EditorSuggestManager | null = null

/** Get or create the EditorSuggestManager singleton. */
export function getEditorSuggestManager(deps?: EditorSuggestManagerDeps): EditorSuggestManager | null {
  if (deps) {
    // Destroy previous instance on re-init (vault switch)
    if (instance) {
      instance.destroy()
    }
    instance = new EditorSuggestManager(deps)
  }
  return instance
}

/** Destroy the current manager (vault switch / unmount). */
export function destroyEditorSuggestManager(): void {
  if (instance) {
    instance.destroy()
    instance = null
  }
}
