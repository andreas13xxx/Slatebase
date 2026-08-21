/**
 * EditorSuggest CM6 Extension — ViewPlugin that drives the EditorSuggest trigger loop.
 *
 * Registered as a global editor extension (not per-plugin). On every transaction
 * that changes the selection or the document, it calls into the EditorSuggestManager
 * to check triggers and update the suggestion popover.
 *
 * Also handles keyboard interception: when the suggest popover is open, Arrow/Enter/
 * Tab/Escape are captured before reaching the editor's default keymap.
 *
 * @module editor-suggest-extension
 */

import { ViewPlugin, type ViewUpdate, keymap } from '@codemirror/view'
import { type Extension, Prec } from '@codemirror/state'
import { getEditorSuggestManager } from './editor-suggest-manager.js'

// ─── ViewPlugin: Trigger Loop ──────────────────────────────────────────────────

/**
 * CM6 ViewPlugin that calls EditorSuggestManager.handleUpdate() on every
 * relevant transaction (cursor move or document change).
 */
const editorSuggestViewPlugin = ViewPlugin.fromClass(
  class {
    update(update: ViewUpdate): void {
      // Only react to selection changes or document changes — not pure viewport scrolls
      if (!update.selectionSet && !update.docChanged) return

      const manager = getEditorSuggestManager()
      if (!manager || manager.count === 0) return

      manager.handleUpdate(update.view)
    }

    destroy(): void {
      const manager = getEditorSuggestManager()
      if (manager) {
        manager.close()
      }
    }
  },
)

// ─── Keymap: Intercept keys when popover is open ───────────────────────────────

/**
 * High-priority keymap that captures navigation keys when the suggest popover
 * is open. Uses `Prec.highest` so it runs before the editor's default bindings.
 *
 * Returns `true` (handled) when the key was consumed by the suggest system,
 * `false` otherwise (fall through to normal editor behavior).
 */
const editorSuggestKeymap = Prec.highest(
  keymap.of([
    {
      key: 'ArrowDown',
      run: () => {
        const manager = getEditorSuggestManager()
        if (!manager?.isOpen()) return false
        return manager.moveSelection(1)
      },
    },
    {
      key: 'ArrowUp',
      run: () => {
        const manager = getEditorSuggestManager()
        if (!manager?.isOpen()) return false
        return manager.moveSelection(-1)
      },
    },
    {
      key: 'Enter',
      run: (view) => {
        const manager = getEditorSuggestManager()
        if (!manager?.isOpen()) return false
        // Create a synthetic keyboard event for the plugin's selectSuggestion
        const syntheticEvt = new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        })
        // Prevent the editor from inserting a newline
        view.contentDOM.dispatchEvent(syntheticEvt)
        return manager.confirmSelection(syntheticEvt)
      },
    },
    {
      key: 'Tab',
      run: () => {
        const manager = getEditorSuggestManager()
        if (!manager?.isOpen()) return false
        const syntheticEvt = new KeyboardEvent('keydown', {
          key: 'Tab',
          bubbles: true,
          cancelable: true,
        })
        return manager.confirmSelection(syntheticEvt)
      },
    },
    {
      key: 'Escape',
      run: () => {
        const manager = getEditorSuggestManager()
        if (!manager?.isOpen()) return false
        manager.close()
        return true
      },
    },
  ]),
)

// ─── Combined Extension ────────────────────────────────────────────────────────

/**
 * The complete EditorSuggest extension bundle.
 * Include this in the editor's extension list to enable EditorSuggest support.
 */
export function createEditorSuggestExtension(): Extension {
  return [
    editorSuggestViewPlugin,
    editorSuggestKeymap,
  ]
}

/**
 * A standalone reference for checking whether the extension is already registered.
 * Prevents double-registration when multiple plugins call registerEditorSuggest.
 */
let extensionRegistered = false

/** Mark the extension as registered. */
export function markEditorSuggestExtensionRegistered(): void {
  extensionRegistered = true
}

/** Check if the extension has been registered. */
export function isEditorSuggestExtensionRegistered(): boolean {
  return extensionRegistered
}

/** Reset registration state (vault switch / cleanup). */
export function resetEditorSuggestExtensionState(): void {
  extensionRegistered = false
}
