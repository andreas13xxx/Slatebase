/**
 * The CodeMirror 6 side of spellchecking: a `linter()` that underlines unknown
 * words, plus the glue that keeps it in sync with the dictionary worker.
 *
 * `@codemirror/lint` was already a dependency (re-exported to Obsidian plugins
 * via install-globals.ts), so the display layer — mark decorations that survive
 * document changes, position mapping, redraw scheduling — costs no extra
 * bundle weight and needs no custom `ViewPlugin` of its own.
 *
 * Only the visible ranges are checked. Diagnostics outside the viewport would
 * be invisible anyway, and re-checking a 5,000-line note on every keystroke is
 * exactly the kind of work that makes an editor feel slow.
 *
 * @module spellcheck/spellcheck-extension
 */
import { linter, forEachDiagnostic, type Diagnostic } from '@codemirror/lint'
import { StateEffect, type EditorState, type Extension } from '@codemirror/state'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { collectWords, type WordToken } from './tokenizer'
import { checkWords, subscribeToSpellcheckChanges } from './spellcheck-client'
import { isIgnoredForSession } from './personal-dictionary'

/**
 * Marks our diagnostics so they can be told apart from a plugin's linter —
 * used to find the word under the cursor and to keep spelling out of the
 * hover tooltips.
 */
export const SPELLCHECK_SOURCE = 'slatebase-spellcheck'

/**
 * Requests a re-lint without a document change. Adding a word to the personal
 * dictionary changes the *answers* while the text stays identical, and
 * `linter()` only re-runs on doc/viewport changes unless told otherwise.
 */
export const spellcheckRefreshEffect = StateEffect.define<null>()

/** A misspelled word the user right-clicked, as located in the diagnostics. */
export interface MisspelledWord {
  from: number
  to: number
  word: string
}

/** Re-runs the spellchecker on a view whose text hasn't changed. */
export function refreshSpellcheck(view: EditorView): void {
  view.dispatch({ effects: spellcheckRefreshEffect.of(null) })
}

/**
 * Finds the misspelled word covering `pos`, or `null`.
 *
 * Reads the diagnostics already in the editor state instead of re-tokenising:
 * whatever is underlined on screen is by definition what the user right-clicked
 * on, so the two can never disagree.
 */
export function misspelledWordAt(state: EditorState, pos: number): MisspelledWord | null {
  const matches: MisspelledWord[] = []

  forEachDiagnostic(state, (diagnostic, from, to) => {
    if (diagnostic.source !== SPELLCHECK_SOURCE) return
    if (pos < from || pos > to) return
    matches.push({ from, to, word: state.sliceDoc(from, to) })
  })

  return matches[0] ?? null
}

/**
 * Wavy red underline, replacing `@codemirror/lint`'s own SVG-background
 * underline for our marks — `text-decoration` follows the design tokens and so
 * adapts to dark mode, which a baked-in SVG colour cannot. The compound
 * selector outranks the `.cm-lintRange-info` rule the base theme sets.
 */
const spellcheckTheme = EditorView.theme({
  '.cm-lintRange.cm-spellError': {
    backgroundImage: 'none',
    paddingBottom: '0',
    textDecoration: 'underline wavy var(--danger)',
    textDecorationSkipInk: 'none',
    textUnderlineOffset: '0.2em',
  },
})

/**
 * Bridges worker events into the editor: when the dictionary finishes loading,
 * the language changes, or a word is learned, every open view re-lints.
 */
const spellcheckRefreshPlugin = ViewPlugin.define((view: EditorView) => {
  const unsubscribe = subscribeToSpellcheckChanges(() => refreshSpellcheck(view))
  return { destroy: unsubscribe }
})

/** Builds the diagnostics for the currently visible text. */
async function lintVisibleText(view: EditorView): Promise<Diagnostic[]> {
  const tokens: WordToken[] = []
  for (const { from, to } of view.visibleRanges) {
    tokens.push(...collectWords(view.state, from, to))
  }

  const candidates = tokens.filter((token) => !isIgnoredForSession(token.word))
  if (candidates.length === 0) return []

  const unknownWords = await checkWords(candidates.map((token) => token.word))
  if (unknownWords.size === 0) return []

  return candidates
    .filter((token) => unknownWords.has(token.word))
    .map((token) => ({
      from: token.from,
      to: token.to,
      severity: 'info' as const,
      source: SPELLCHECK_SOURCE,
      markClass: 'cm-spellError',
      message: 'Unbekanntes Wort: ' + token.word,
    }))
}

/**
 * The complete spellcheck extension. Put it in a Compartment so the
 * "Rechtschreibprüfung" toggle can add and remove it without rebuilding the
 * editor state (see CodeMirrorEditor.tsx).
 */
export function spellcheckExtension(): Extension {
  return [
    spellcheckTheme,
    spellcheckRefreshPlugin,
    linter(lintVisibleText, {
      // Long enough that a fast typist finishes a word before it is judged.
      delay: 500,
      needsRefresh: (update) =>
        update.viewportChanged ||
        update.transactions.some((tr) => tr.effects.some((effect) => effect.is(spellcheckRefreshEffect))),
      // Suggestions belong in the context menu, where they can be applied with
      // one click; a hover tooltip repeating the word adds nothing. Other
      // linters' tooltips are left untouched.
      tooltipFilter: (diagnostics) => diagnostics.filter((d) => d.source !== SPELLCHECK_SOURCE),
    }),
  ]
}
