import { describe, it, expect, afterEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { indentGuideRanges, indentGuides } from './indent-guides'

describe('indentGuideRanges', () => {
  it('marks every tab of the leading whitespace', () => {
    expect(indentGuideRanges(10, '\t\t- item', 4)).toEqual([[10, 11], [11, 12]])
  })

  it('marks the first space of every whole level of spaces', () => {
    expect(indentGuideRanges(0, '        x', 4)).toEqual([[0, 1], [4, 5]])
    expect(indentGuideRanges(0, '      x', 4)).toEqual([[0, 1]]) // 6 spaces: the second level is not whole
    expect(indentGuideRanges(0, '  x', 4)).toEqual([])
  })

  it('follows the tab width', () => {
    expect(indentGuideRanges(0, '    x', 2)).toEqual([[0, 1], [2, 3]])
  })

  it('counts columns when tabs and spaces are mixed', () => {
    // four spaces fill the first level, then a tab fills the second
    expect(indentGuideRanges(0, '    \tx', 4)).toEqual([[0, 1], [4, 5]])
    // a tab after two spaces ends on the next stop and starts no level of its own
    expect(indentGuideRanges(0, '  \tx', 4)).toEqual([])
  })

  it('marks nothing in text that is not indented, and not whitespace inside the line', () => {
    expect(indentGuideRanges(0, 'plain    text', 4)).toEqual([])
    expect(indentGuideRanges(0, '', 4)).toEqual([])
  })

  it('stops at the first character that is not whitespace', () => {
    expect(indentGuideRanges(0, '\t- a\t\tb', 4)).toEqual([[0, 1]])
  })
})

describe('indentGuides', () => {
  const views: EditorView[] = []
  afterEach(() => { while (views.length > 0) views.pop()!.destroy() })

  it('draws a guide span per level in the editor', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: '- a\n\t- b\n\t\t- c\n', extensions: [indentGuides()] }),
      parent: document.body,
    })
    views.push(view)

    expect(view.dom.querySelectorAll('.cm-indent-guide')).toHaveLength(3)
  })

  it('follows edits', () => {
    const view = new EditorView({ state: EditorState.create({ doc: 'a', extensions: [indentGuides()] }), parent: document.body })
    views.push(view)
    expect(view.dom.querySelectorAll('.cm-indent-guide')).toHaveLength(0)

    view.dispatch({ changes: { from: 0, insert: '\t' } })

    expect(view.dom.querySelectorAll('.cm-indent-guide')).toHaveLength(1)
  })
})
