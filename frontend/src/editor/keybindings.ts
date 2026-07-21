import type { Extension } from '@codemirror/state'
import type { EditorView, KeyBinding } from '@codemirror/view'
import { keymap } from '@codemirror/view'
import {
  defaultKeymap,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import type { EditorFormattingAction } from './types'

/**
 * Creates a CM6 keymap extension that integrates with the Slatebase keybinding system.
 * Includes standard keybindings (undo, redo, select all, indent) plus
 * editor formatting shortcuts from keybindingsStore.
 */
export function createKeybindingsExtension(
  onFormatting: (action: EditorFormattingAction) => void
): Extension {
  const formattingBindings: KeyBinding[] = [
    {
      key: 'Mod-b',
      run: () => {
        onFormatting('bold')
        return true
      },
    },
    {
      key: 'Mod-i',
      run: () => {
        onFormatting('italic')
        return true
      },
    },
    {
      key: 'Mod-k',
      run: () => {
        onFormatting('link')
        return true
      },
    },
    {
      key: 'Mod-Shift-s',
      run: () => {
        onFormatting('strikethrough')
        return true
      },
    },
    {
      key: 'Mod-e',
      run: () => {
        onFormatting('code')
        return true
      },
    },
    {
      key: 'Mod-Shift-7',
      run: () => {
        onFormatting('numberedList')
        return true
      },
    },
    {
      key: 'Mod-Shift-8',
      run: () => {
        onFormatting('bulletList')
        return true
      },
    },
    {
      key: 'Mod-Shift-9',
      run: () => {
        onFormatting('quote')
        return true
      },
    },
  ]

  return [
    keymap.of(formattingBindings),
    keymap.of([indentWithTab]),
    keymap.of(historyKeymap),
    keymap.of(defaultKeymap),
  ]
}

/**
 * Creates a DOM event listener that handles slatebase:editor-command events.
 * Should be attached to window by the component using the editor.
 *
 * Commands from CommandPaletteContainer dispatch CustomEvent with
 * `{ detail: { action: string } }` — the action maps to EditorFormattingAction.
 */
export function createEditorCommandHandler(
  getView: () => EditorView | null,
  onFormatting: (action: EditorFormattingAction) => void
): (event: Event) => void {
  return (event: Event) => {
    const view = getView()
    if (!view) return

    const customEvent = event as CustomEvent<{ action: string }>
    const action = customEvent.detail?.action
    if (!action) return

    onFormatting(action as EditorFormattingAction)
    view.focus()
  }
}
