import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'
import { remarkFootnotes, getFootnoteEntries, type NumberedFootnoteReference } from './plugin'

/** Parses markdown through the same plugin order ViewMode uses for footnotes. */
function parse(markdown: string): Root {
  const pipeline = unified().use(remarkParse).use(remarkGfm).use(remarkFootnotes)
  return pipeline.runSync(pipeline.parse(markdown)) as Root
}

/** Every footnote reference in the tree, in document order. */
function references(tree: Root): NumberedFootnoteReference[] {
  const found: NumberedFootnoteReference[] = []
  visit(tree, 'footnoteReference', (node) => { found.push(node as NumberedFootnoteReference) })
  return found
}

describe('remarkFootnotes', () => {
  it('numbers footnotes by reference order, not definition order', () => {
    const tree = parse('Erst [^b], dann [^a].\n\n[^a]: Anna\n[^b]: Bert\n')

    expect(getFootnoteEntries(tree).map((e) => [e.identifier, e.number])).toEqual([['b', 1], ['a', 2]])
    expect(references(tree).map((r) => r.fnNumber)).toEqual([1, 2])
  })

  it('keeps the definition body with its entry', () => {
    const tree = parse('Text[^1].\n\n[^1]: Die Quelle\n')

    const [entry] = getFootnoteEntries(tree)
    expect(entry?.referenced).toBe(true)
    expect(entry?.definition.children[0]).toMatchObject({ type: 'paragraph' })
  })

  it('marks only the first reference of a repeated footnote as the back-link target', () => {
    const tree = parse('A[^1] und nochmal B[^1].\n\n[^1]: Einmal\n')

    const refs = references(tree)
    expect(refs).toHaveLength(2)
    expect(refs.map((r) => r.fnNumber)).toEqual([1, 1])
    expect(refs.map((r) => r.fnFirstRef)).toEqual([true, undefined])
    expect(getFootnoteEntries(tree)).toHaveLength(1)
  })

  it('lists a definition nothing references, after the referenced ones', () => {
    const tree = parse('Nur eine[^1].\n\n[^1]: Verwendet\n\n[^waise]: Verwaist\n')

    expect(getFootnoteEntries(tree).map((e) => [e.identifier, e.referenced])).toEqual([
      ['1', true],
      ['waise', false],
    ])
  })

  it('leaves a tree without footnotes untouched', () => {
    const tree = parse('Nur Text ohne Fußnoten.\n')

    expect(getFootnoteEntries(tree)).toEqual([])
  })

  it('reports no entries for a tree that never went through the plugin', () => {
    const bare = unified().use(remarkParse).use(remarkGfm).parse('Text[^1].\n\n[^1]: X\n')

    expect(getFootnoteEntries(bare)).toEqual([])
  })
})
