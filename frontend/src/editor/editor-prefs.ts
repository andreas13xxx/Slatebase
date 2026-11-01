/**
 * Editor preferences from the vault's `.obsidian/app.json`: indentation (`useTab`, `tabSize`), automatic
 * pairs (`autoPairBrackets`, `autoPairMarkdown`) and the text direction (`rightToLeft`). Built as one
 * extension that CodeMirrorEditor keeps in a Compartment, so a change in the file or the settings
 * applies to an open note without reloading it.
 */
import { EditorSelection, EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentUnit } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'

export interface EditorPrefs {
  tabSize: number
  useTab: boolean
  autoPairBrackets: boolean
  autoPairMarkdown: boolean
  rightToLeft: boolean
}

/** Obsidian's defaults (the same values as the app.json key table). */
export const DEFAULT_EDITOR_PREFS: Readonly<EditorPrefs> = {
  tabSize: 4,
  useTab: true,
  autoPairBrackets: true,
  autoPairMarkdown: true,
  rightToLeft: false,
}

/** Characters that wrap a selection instead of replacing it when `autoPairMarkdown` is on. */
const MARKDOWN_WRAP_CHARS = new Set(['*', '_', '`'])

/**
 * With text selected, typing one of `* _ \`` wraps the selection (`**` and `_` emphasis, inline code)
 * instead of replacing it. Without a selection nothing is paired, so a list marker `* ` stays one star.
 */
const markdownWrapHandler = EditorView.inputHandler.of((view, _from, _to, text) => {
  if (text.length !== 1 || !MARKDOWN_WRAP_CHARS.has(text) || view.state.readOnly) return false
  const { ranges } = view.state.selection
  if (ranges.every((range) => range.empty)) return false
  // Every non-empty selection is wrapped (several cursors at once); empty ones take the character as usual
  view.dispatch(view.state.changeByRange((range) => range.empty
    ? { changes: { from: range.from, insert: text }, range: EditorSelection.cursor(range.from + 1) }
    : {
        changes: [{ from: range.from, insert: text }, { from: range.to, insert: text }],
        range: EditorSelection.range(range.from + 1, range.to + 1),
      }), { userEvent: 'input.type' })
  return true
})

/** The extension for these preferences. */
export function editorPrefsExtension(prefs: EditorPrefs): Extension {
  const extensions: Extension[] = [
    EditorState.tabSize.of(prefs.tabSize),
    indentUnit.of(prefs.useTab ? '\t' : ' '.repeat(prefs.tabSize)),
  ]
  // The keymap makes Backspace between an auto-inserted pair remove both characters
  if (prefs.autoPairBrackets) extensions.push(closeBrackets(), keymap.of(closeBracketsKeymap))
  if (prefs.autoPairMarkdown) extensions.push(markdownWrapHandler)
  if (prefs.rightToLeft) extensions.push(EditorView.contentAttributes.of({ dir: 'rtl' }))
  return extensions
}
