/**
 * Editing behavior the vault's `.obsidian/app.json` controls: how Tab indents and whether typing an
 * opening bracket or Markdown mark also inserts its partner. One CM6 extension, swapped through a
 * Compartment when the setting changes.
 */

import { EditorState, type Extension } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'

/** The four `app.json` values behind the editor's typing behavior. */
export interface EditingBehavior {
  /** Tab indents with a tab character instead of spaces (`useTab`). */
  useTab: boolean
  /** Width of one indent level, in spaces or as the display width of a tab (`tabSize`). */
  tabSize: number
  /** Typing `(`, `[`, `{` or `"` inserts the closing partner (`autoPairBrackets`). */
  autoPairBrackets: boolean
  /** Typing `*`, `_`, `` ` `` or `~` inserts the closing partner (`autoPairMarkdown`). */
  autoPairMarkdown: boolean
}

/**
 * Used where the vault says nothing. Spaces, width 4 (Obsidian's `tabSize` default), and no
 * auto-pairing — the editor's behavior before these keys were read, so an existing vault types
 * as it did.
 */
export const DEFAULT_EDITING_BEHAVIOR: EditingBehavior = {
  useTab: false,
  tabSize: 4,
  autoPairBrackets: false,
  autoPairMarkdown: false,
}

/** Same bounds as the backend schema for `tabSize`. */
export const MIN_TAB_SIZE = 1
export const MAX_TAB_SIZE = 16

/** The tab size if it is an integer within bounds, else the default. */
export function normalizeTabSize(value: number): number {
  return Number.isInteger(value) && value >= MIN_TAB_SIZE && value <= MAX_TAB_SIZE ? value : DEFAULT_EDITING_BEHAVIOR.tabSize
}

/** Pairs inserted for `autoPairBrackets`. */
export const BRACKET_PAIRS = ['(', '[', '{', '"']
/** Pairs inserted for `autoPairMarkdown`. */
export const MARKDOWN_PAIRS = ['*', '_', '`', '~']

/**
 * The extension for one set of values. Auto-pairing is `closeBrackets()` (it steps over an
 * already-typed partner, deletes a pair on Backspace and does not pair next to a word character)
 * restricted to the enabled sets; with both switched off nothing pairing-related is installed.
 */
export function editingBehaviorExtension(behavior: EditingBehavior): Extension {
  // The value comes from a file anyone may have edited; CM6 throws on an empty indent unit.
  const tabSize = normalizeTabSize(behavior.tabSize)
  const extensions: Extension[] = [
    indentUnit.of(behavior.useTab ? '\t' : ' '.repeat(tabSize)),
    EditorState.tabSize.of(tabSize),
  ]

  const brackets = [
    ...(behavior.autoPairBrackets ? BRACKET_PAIRS : []),
    ...(behavior.autoPairMarkdown ? MARKDOWN_PAIRS : []),
  ]
  if (brackets.length > 0) {
    extensions.push(
      closeBrackets(),
      EditorState.languageData.of(() => [{ closeBrackets: { brackets } }]),
      keymap.of(closeBracketsKeymap),
    )
  }
  return extensions
}
