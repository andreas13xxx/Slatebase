import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { keymap } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

/**
 * Creates a CM6 extension for bracket auto-closing.
 * Includes both the closeBrackets behavior and its keymap.
 * Returns empty extension array when disabled.
 */
export function createBracketCloseExtension(enabled: boolean): Extension {
  if (!enabled) {
    return []
  }
  return [closeBrackets(), keymap.of(closeBracketsKeymap)]
}
