/**
 * Editor preferences from the vault's `.obsidian/app.json`: indentation (`useTab`, `tabSize`), automatic
 * pairs (`autoPairBrackets`, `autoPairMarkdown`), list continuation (`smartIndentList`), indent guides
 * (`showIndentGuide`) and the text direction (`rightToLeft`). Built as one
 * extension that CodeMirrorEditor keeps in a Compartment, so a change in the file or the settings
 * applies to an open note without reloading it.
 */
import { EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentUnit } from '@codemirror/language'
import { insertNewlineAndIndent } from '@codemirror/commands'
import { closeBrackets, closeBracketsKeymap, completionStatus } from '@codemirror/autocomplete'
import { indentGuides } from './indent-guides'

export interface EditorPrefs {
  tabSize: number
  useTab: boolean
  autoPairBrackets: boolean
  autoPairMarkdown: boolean
  rightToLeft: boolean
  /** Enter in a list or quote continues it with a new marker; off, it only keeps the indentation. */
  smartIndentList: boolean
  /** Thin vertical lines at the indentation levels. */
  showIndentGuide: boolean
}

/** Obsidian's defaults (the same values as the app.json key table). */
export const DEFAULT_EDITOR_PREFS: Readonly<EditorPrefs> = {
  tabSize: 4,
  useTab: true,
  autoPairBrackets: true,
  autoPairMarkdown: true,
  rightToLeft: false,
  smartIndentList: true,
  showIndentGuide: true,
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
  // The Markdown language continues lists and quotes on Enter; ahead of it, a plain newline keeps only the indentation (an open completion list still takes the key)
  if (!prefs.smartIndentList) extensions.push(Prec.highest(keymap.of([{ key: 'Enter', run: (view) => completionStatus(view.state) === 'active' ? false : insertNewlineAndIndent(view) }])))
  if (prefs.showIndentGuide) extensions.push(indentGuides())
  return extensions
}
