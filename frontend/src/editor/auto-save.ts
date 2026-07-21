import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

/**
 * Creates a CM6 extension that debounces document changes and calls the callback.
 * Uses a 2-second debounce to match the existing auto-save pattern.
 *
 * @param onSave - Callback invoked with the new document content after debounce period
 * @param debounceMs - Debounce delay in milliseconds (default: 2000)
 */
export function createAutoSaveExtension(
  onSave: (content: string) => void,
  debounceMs: number = 2000
): Extension {
  let timer: ReturnType<typeof setTimeout> | null = null

  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) return

    if (timer !== null) {
      clearTimeout(timer)
    }

    // Capture the view reference for use in the timeout
    const view = update.view
    timer = setTimeout(() => {
      timer = null
      onSave(view.state.doc.toString())
    }, debounceMs)
  })
}
