import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { codeFolding, foldedRanges } from '@codemirror/language'
import { jumpToOutlineHeading, setOutlineHeadingFolded } from './folding'

function makeView(doc: string): EditorView {
  return new EditorView({ state: EditorState.create({ doc, extensions: [codeFolding()] }), parent: document.body })
}

const DOC = '# Eins\ntext\n## Unter\nmehr\n# Zwei\nende'

describe('outline heading helpers', () => {
  it('jumps to the n-th heading', () => {
    const view = makeView(DOC)
    expect(jumpToOutlineHeading(view, 1)).toBe(true)
    expect(view.state.selection.main.head).toBe(DOC.indexOf('## Unter'))
    expect(jumpToOutlineHeading(view, 9)).toBe(false)
    view.destroy()
  })

  it('folds and unfolds a heading section', () => {
    const view = makeView(DOC)
    expect(setOutlineHeadingFolded(view, 0, true)).toBe(true)
    expect(foldedRanges(view.state).size).toBe(1)
    expect(setOutlineHeadingFolded(view, 0, false)).toBe(true)
    expect(foldedRanges(view.state).size).toBe(0)
    view.destroy()
  })
})
