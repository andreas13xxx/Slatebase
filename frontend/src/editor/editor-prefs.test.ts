import { describe, it, expect, afterEach } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { closeBracketsKeymap } from '@codemirror/autocomplete'
import { EditorView, runScopeHandlers } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { indentUnit, foldable } from '@codemirror/language'
import { DEFAULT_EDITOR_PREFS, editorPrefsExtension, type EditorPrefs } from './editor-prefs'
import { markdownFoldService } from './folding'
import { _reset as resetAppConfig, initialize, setActiveVault } from '../state/vaultAppConfigStore'
import type { IApiClient } from '../api'

const views: EditorView[] = []

function viewWith(prefs: Partial<EditorPrefs>, doc = ''): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [EditorState.allowMultipleSelections.of(true), editorPrefsExtension({ ...DEFAULT_EDITOR_PREFS, ...prefs })] }),
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

  it('wraps every selected range when there are several', () => {
    const view = viewWith({ autoPairMarkdown: true, autoPairBrackets: false }, 'one two')
    view.dispatch({ selection: EditorSelection.create([EditorSelection.range(0, 3), EditorSelection.range(4, 7)]) })
    type(view, '_')
    expect(view.state.doc.toString()).toBe('_one_ _two_')
  })

  it('removes both characters of an auto-inserted pair on Backspace', () => {
    const view = viewWith({ autoPairBrackets: true })
    type(view, '(')
    expect(view.state.doc.toString()).toBe('()')
    const backspace = closeBracketsKeymap.find((binding) => binding.key === 'Backspace')!
    backspace.run!(view)
    expect(view.state.doc.toString()).toBe('')
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

  it('continues a list on Enter only while smartIndentList is on', () => {
    const enter = (smartIndentList: boolean): string => {
      const view = new EditorView({
        state: EditorState.create({
          doc: '- item',
          selection: { anchor: 6 },
          extensions: [markdown(), editorPrefsExtension({ ...DEFAULT_EDITOR_PREFS, smartIndentList })],
        }),
        parent: document.body,
      })
      views.push(view)
      runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Enter' }), 'editor')
      return view.state.doc.toString()
    }

    expect(enter(true)).toBe('- item\n- ')
    expect(enter(false)).toBe('- item\n')
  })

  it('draws indent guides only while showIndentGuide is on', () => {
    const guides = (showIndentGuide: boolean): number => {
      const view = viewWith({ showIndentGuide }, '\t- a')
      return view.dom.querySelectorAll('.cm-indent-guide').length
    }

    expect(guides(true)).toBe(1)
    expect(guides(false)).toBe(0)
  })
})

