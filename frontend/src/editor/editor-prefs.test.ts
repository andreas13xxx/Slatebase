import { describe, it, expect, afterEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { indentUnit, foldable } from '@codemirror/language'
import { DEFAULT_EDITOR_PREFS, editorPrefsExtension, type EditorPrefs } from './editor-prefs'
import { markdownFoldService } from './folding'
import { _reset as resetAppConfig, initialize, setActiveVault } from '../state/vaultAppConfigStore'
import type { IApiClient } from '../api'

const views: EditorView[] = []

function viewWith(prefs: Partial<EditorPrefs>, doc = ''): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [editorPrefsExtension({ ...DEFAULT_EDITOR_PREFS, ...prefs })] }),
    parent: document.body,
  })
  views.push(view)
  return view
}

afterEach(() => {
  while (views.length > 0) views.pop()!.destroy()
})

/** Types one character the way the browser would, through the view's input handlers. */
function type(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main
  const handled = view.state.facet(EditorView.inputHandler).some((handler) => handler(view, from, to, text, () => view.state.update({ changes: { from, to, insert: text } })))
  if (!handled) view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
}

describe('editorPrefsExtension', () => {
  it('indents with a tab, or with tabSize spaces', () => {
    expect(viewWith({ useTab: true }).state.facet(indentUnit)).toBe('\t')
    expect(viewWith({ useTab: false, tabSize: 2 }).state.facet(indentUnit)).toBe('  ')
    expect(viewWith({ tabSize: 8 }).state.tabSize).toBe(8)
  })

  it('closes brackets only while autoPairBrackets is on', () => {
    const on = viewWith({ autoPairBrackets: true })
    type(on, '(')
    expect(on.state.doc.toString()).toBe('()')

    const off = viewWith({ autoPairBrackets: false })
    type(off, '(')
    expect(off.state.doc.toString()).toBe('(')
  })

  it('wraps a selection in * _ ` with autoPairMarkdown, and pairs nothing without a selection', () => {
    const view = viewWith({ autoPairMarkdown: true, autoPairBrackets: false }, 'word')
    view.dispatch({ selection: { anchor: 0, head: 4 } })
    type(view, '*')
    expect(view.state.doc.toString()).toBe('*word*')
    expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('word')

    const bare = viewWith({ autoPairMarkdown: true, autoPairBrackets: false })
    type(bare, '*')
    expect(bare.state.doc.toString()).toBe('*')

    const off = viewWith({ autoPairMarkdown: false, autoPairBrackets: false }, 'word')
    off.dispatch({ selection: { anchor: 0, head: 4 } })
    type(off, '*')
    expect(off.state.doc.toString()).toBe('*')
  })

  it('sets the text direction', () => {
    expect(viewWith({ rightToLeft: true }).contentDOM.getAttribute('dir')).toBe('rtl')
    expect(viewWith({ rightToLeft: false }).contentDOM.getAttribute('dir')).toBeNull()
  })
})

describe('markdownFoldService honours foldHeading and foldIndent', () => {
  const doc = '# Title\ntext\n- item\n  child\n'

  async function foldableAt(file: Record<string, unknown>, lineStart: number): Promise<boolean> {
    resetAppConfig()
    initialize({ getAppConfig: async () => file } as unknown as IApiClient)
    await setActiveVault('v1')
    const state = EditorState.create({ doc, extensions: [markdownFoldService] })
    return foldable(state, lineStart, state.doc.lineAt(lineStart).to) !== null
  }

  it('folds headings and lists by default', async () => {
    expect(await foldableAt({}, 0)).toBe(true)
    expect(await foldableAt({}, doc.indexOf('- item'))).toBe(true)
  })

  it('does not fold headings with foldHeading off, nor lists with foldIndent off', async () => {
    expect(await foldableAt({ foldHeading: false }, 0)).toBe(false)
    expect(await foldableAt({ foldHeading: false }, doc.indexOf('- item'))).toBe(true)
    expect(await foldableAt({ foldIndent: false }, doc.indexOf('- item'))).toBe(false)
    expect(await foldableAt({ foldIndent: false }, 0)).toBe(true)
  })
})
