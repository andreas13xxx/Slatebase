import { describe, it, expect } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { codeFolding, foldAll, unfoldAll, toggleFold, foldedRanges } from '@codemirror/language'
import {
  markdownFoldService,
  findAllHeadingSections,
  toggleFoldProperties,
  foldMore,
  foldLess,
} from './folding'

function makeView(doc: string, cursorPos?: number): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [codeFolding(), markdownFoldService] }),
    parent: document.body,
  })
  if (cursorPos !== undefined) view.dispatch({ selection: { anchor: cursorPos } })
  return view
}

function foldedRangeList(view: EditorView): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => { ranges.push({ from, to }) })
  return ranges
}

describe('findAllHeadingSections', () => {
  it('finds every heading with its section range', () => {
    const doc = '# Title\n\n## A\n\nBody A.\n\n## B\n\nBody B.'
    const view = makeView(doc)

    const sections = findAllHeadingSections(view.state)

    expect(sections.map((s) => s.level)).toEqual([1, 2, 2])
    view.destroy()
  })
})

describe('markdownFoldService via foldAll/unfoldAll', () => {
  it('foldAll collapses every heading section', () => {
    const doc = '# Title\n\nIntro.\n\n## A\n\nBody A.\n\n## B\n\nBody B.'
    const view = makeView(doc)

    foldAll(view)

    expect(foldedRangeList(view).length).toBeGreaterThan(0)
    view.destroy()
  })

  it('unfoldAll clears all folds', () => {
    const doc = '# Title\n\n## A\n\nBody A.'
    const view = makeView(doc)
    foldAll(view)
    expect(foldedRangeList(view).length).toBeGreaterThan(0)

    unfoldAll(view)

    expect(foldedRangeList(view)).toHaveLength(0)
    view.destroy()
  })

  it('toggleFold folds the heading section at the cursor, then unfolds it', () => {
    const doc = '# Title\n\n## A\n\nBody A.\n\n## B\n\nBody B.'
    const view = makeView(doc, doc.indexOf('## A'))

    toggleFold(view)
    const afterFold = foldedRangeList(view)
    expect(afterFold.length).toBeGreaterThan(0)

    toggleFold(view)
    expect(foldedRangeList(view)).toHaveLength(0)
    view.destroy()
  })

  it('folds a list item with a nested sub-list', () => {
    const doc = '- Parent\n  - Child 1\n  - Child 2\n- Sibling'
    const view = makeView(doc, doc.indexOf('Parent'))

    toggleFold(view)

    const folded = foldedRangeList(view)
    expect(folded).toHaveLength(1)
    expect(view.state.doc.sliceString(folded[0]!.from, folded[0]!.to)).toBe('\n  - Child 1\n  - Child 2')
    view.destroy()
  })

  it('does not treat a list item with no nested content as foldable', () => {
    const doc = '- Item one\n- Item two'
    const view = makeView(doc, doc.indexOf('Item one'))

    toggleFold(view)

    expect(foldedRangeList(view)).toHaveLength(0)
    view.destroy()
  })
})

describe('toggleFoldProperties', () => {
  it('folds the frontmatter block, keeping the opening delimiter visible', () => {
    const doc = '---\ntags: [a]\naliases: [b]\n---\nBody.'
    const view = makeView(doc)

    toggleFoldProperties(view)

    const folded = foldedRangeList(view)
    expect(folded).toHaveLength(1)
    expect(view.state.doc.sliceString(folded[0]!.from, folded[0]!.to)).toBe('tags: [a]\naliases: [b]\n---')
    view.destroy()
  })

  it('unfolds an already-folded frontmatter block', () => {
    const doc = '---\ntags: [a]\n---\nBody.'
    const view = makeView(doc)
    toggleFoldProperties(view)
    expect(foldedRangeList(view)).toHaveLength(1)

    toggleFoldProperties(view)

    expect(foldedRangeList(view)).toHaveLength(0)
    view.destroy()
  })

  it('does nothing when there is no frontmatter block', () => {
    const view = makeView('Just body text.')

    toggleFoldProperties(view)

    expect(foldedRangeList(view)).toHaveLength(0)
    view.destroy()
  })
})

describe('foldMore / foldLess', () => {
  const doc = '# Title\n\n## A\n\nBody A.\n\n## B\n\nBody B.\n\n### A1\n\nDeep.'

  it('foldMore folds the deepest heading level first (H3 before H2/H1)', () => {
    const view = makeView(doc)

    foldMore(view)

    const sections = findAllHeadingSections(view.state)
    const h3 = sections.find((s) => s.level === 3)!
    const h2s = sections.filter((s) => s.level === 2)
    const folded = foldedRangeList(view)
    expect(folded).toContainEqual({ from: h3.from, to: h3.to })
    // H2 sections should still be unfolded after only one foldMore call.
    for (const h2 of h2s) {
      expect(folded).not.toContainEqual({ from: h2.from, to: h2.to })
    }
    view.destroy()
  })

  it('repeated foldMore calls progress to shallower levels', () => {
    const view = makeView(doc)

    foldMore(view) // folds H3
    foldMore(view) // folds H2 sections

    const sections = findAllHeadingSections(view.state)
    const h2s = sections.filter((s) => s.level === 2)
    const folded = foldedRangeList(view)
    for (const h2 of h2s) {
      expect(folded).toContainEqual({ from: h2.from, to: h2.to })
    }
    view.destroy()
  })

  it('foldLess unfolds the shallowest folded level first', () => {
    const view = makeView(doc)
    foldMore(view) // H3
    foldMore(view) // H2
    foldMore(view) // H1

    foldLess(view) // should unfold H1 first (shallowest)

    const sections = findAllHeadingSections(view.state)
    const h1 = sections.find((s) => s.level === 1)!
    const h2s = sections.filter((s) => s.level === 2)
    const folded = foldedRangeList(view)
    expect(folded).not.toContainEqual({ from: h1.from, to: h1.to })
    for (const h2 of h2s) {
      expect(folded).toContainEqual({ from: h2.from, to: h2.to })
    }
    view.destroy()
  })

  it('foldMore is a no-op when there are no headings', () => {
    const view = makeView('Just plain text.')

    expect(() => foldMore(view)).not.toThrow()
    expect(foldedRangeList(view)).toHaveLength(0)
    view.destroy()
  })
})
