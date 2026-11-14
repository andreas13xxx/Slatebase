import { describe, it, expect, afterEach } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { getIndentUnit, indentString } from '@codemirror/language'
import { deleteCharBackward, indentMore } from '@codemirror/commands'
import { closeBracketsKeymap } from '@codemirror/autocomplete'
import { editingBehaviorExtension, DEFAULT_EDITING_BEHAVIOR, type EditingBehavior } from './editing-behavior'

const views: EditorView[] = []

function createView(doc: string, behavior: Partial<EditingBehavior>, cursor = doc.length): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(cursor),
      extensions: [editingBehaviorExtension({ ...DEFAULT_EDITING_BEHAVIOR, ...behavior })],
    }),
    parent: document.body,
  })
  views.push(view)
  return view
}

/** Types text the way the browser reports it: input handlers first, plain insertion otherwise. */
function type(view: EditorView, text: string): void {
  const { from, to } = view.state.selection.main
  const insert = () => view.state.update({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
  const handled = view.state.facet(EditorView.inputHandler).some((handler) => handler(view, from, to, text, insert))
  if (!handled) view.dispatch(insert())
}

afterEach(() => {
  while (views.length > 0) views.pop()?.destroy()
})

describe('editingBehaviorExtension — indentation', () => {
  it('indents with the configured number of spaces', () => {
    const view = createView('a', { useTab: false, tabSize: 3 })
    expect(getIndentUnit(view.state)).toBe(3)
    expect(view.state.tabSize).toBe(3)
    indentMore(view)
    expect(view.state.doc.toString()).toBe('   a')
  })

  it('indents with a tab character when useTab is on', () => {
    const view = createView('a', { useTab: true, tabSize: 4 })
    expect(indentString(view.state, 4)).toBe('\t')
    indentMore(view)
    expect(view.state.doc.toString()).toBe('\ta')
    expect(view.state.tabSize).toBe(4)
  })
})

describe('editingBehaviorExtension — tab size from a hand-edited file', () => {
  it.each([0, -1, 1e9, 2.5, Number.NaN])('falls back to the default for %s instead of throwing', (tabSize) => {
    const view = createView('a', { tabSize })
    expect(getIndentUnit(view.state)).toBe(DEFAULT_EDITING_BEHAVIOR.tabSize)
    expect(view.state.tabSize).toBe(DEFAULT_EDITING_BEHAVIOR.tabSize)
  })
})

describe('editingBehaviorExtension — auto-pairing', () => {
  it('pairs nothing by default', () => {
    const view = createView('', {})
    type(view, '(')
    type(view, '*')
    expect(view.state.doc.toString()).toBe('(*')
  })

  it('pairs brackets and quotes when autoPairBrackets is on, and steps over the closing one', () => {
    const view = createView('', { autoPairBrackets: true })
    type(view, '[')
    expect(view.state.doc.toString()).toBe('[]')
    expect(view.state.selection.main.head).toBe(1)
    type(view, 'x')
    type(view, ']')
    expect(view.state.doc.toString()).toBe('[x]')
    expect(view.state.selection.main.head).toBe(3)
  })

  it('does not pair Markdown marks with only autoPairBrackets on', () => {
    const view = createView('', { autoPairBrackets: true })
    type(view, '*')
    expect(view.state.doc.toString()).toBe('*')
  })

  it('pairs Markdown marks when autoPairMarkdown is on, but not brackets', () => {
    const view = createView('', { autoPairMarkdown: true })
    type(view, '`')
    expect(view.state.doc.toString()).toBe('``')
    view.dispatch({ changes: { from: 0, to: 2, insert: '' } })
    type(view, '(')
    expect(view.state.doc.toString()).toBe('(')
  })

  it('does not pair a mark typed right after a word character', () => {
    const view = createView('snake', { autoPairMarkdown: true })
    type(view, '_')
    expect(view.state.doc.toString()).toBe('snake_')
  })

  it('removes both halves of an empty pair on Backspace', () => {
    const view = createView('', { autoPairBrackets: true })
    type(view, '(')
    const backspace = closeBracketsKeymap.find((binding) => binding.key === 'Backspace')
    expect(backspace?.run?.(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('')
    // Without a pair, Backspace is left to the editor's own command.
    view.dispatch({ changes: { from: 0, insert: 'ab' }, selection: { anchor: 2 } })
    expect(deleteCharBackward(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('a')
  })
})
