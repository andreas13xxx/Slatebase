import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Root, Table, TableRow } from 'mdast'
import { remarkWikilink } from './plugin'
import { wikilinkToMarkdown } from './mdast-util'
import type { WikilinkNode } from '../types'

function parseTable(markdown: string): Table {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkWikilink).parse(markdown) as Root
  const table = tree.children.find((node) => node.type === 'table') as Table
  expect(table).toBeDefined()
  return table
}

function cellChildren(table: Table, row: number, col: number): TableRow['children'][number]['children'] {
  return (table.children[row] as TableRow).children[col].children
}

describe('wikilink inside GFM table cells', () => {
  it('parses an aliased wikilink with an escaped pipe as a single cell', () => {
    const table = parseTable(
      '| Guide | Beschreibung |\n' +
        '| --- | --- |\n' +
        '| [[Features/Wikilinks\\|Wikilinks]] | Notizen miteinander verlinken |\n'
    )

    // Exactly two cells per row - the escaped pipe must not be treated as
    // an extra column delimiter.
    expect((table.children[1] as TableRow).children).toHaveLength(2)

    const link = cellChildren(table, 1, 0)[0] as WikilinkNode
    expect(link.type).toBe('wikilink')
    expect(link.target).toBe('Features/Wikilinks')
    expect(link.display).toBe('Wikilinks')

    const description = cellChildren(table, 1, 1)[0]
    expect(description).toMatchObject({ type: 'text', value: 'Notizen miteinander verlinken' })
  })

  it('parses an aliased wikilink with a heading and an escaped pipe', () => {
    const table = parseTable(
      '| Guide | Beschreibung |\n' +
        '| --- | --- |\n' +
        '| [[Page#Section\\|Custom]] | text |\n'
    )

    const link = cellChildren(table, 1, 0)[0] as WikilinkNode
    expect(link.target).toBe('Page')
    expect(link.heading).toBe('Section')
    expect(link.display).toBe('Custom')
  })

  it('still supports an unescaped pipe outside of a table', () => {
    const tree = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkWikilink)
      .parse('See [[Features/Wikilinks|Wikilinks]]') as Root
    const paragraph = tree.children[0] as { children: WikilinkNode[] }
    const link = paragraph.children.find((child) => child.type === 'wikilink')!
    expect(link.target).toBe('Features/Wikilinks')
    expect(link.display).toBe('Wikilinks')
  })
})

describe('wikilinkToMarkdown pipe escaping', () => {
  const handler = wikilinkToMarkdown().handlers!.wikilink as (
    node: WikilinkNode,
    parent: undefined,
    state: { stack: string[] }
  ) => string

  const node: WikilinkNode = {
    type: 'wikilink',
    target: 'Features/Wikilinks',
    display: 'Wikilinks',
    heading: null,
    blockRef: null,
    value: '',
  }

  it('escapes the alias pipe when serialized inside a table cell', () => {
    const out = handler(node, undefined, { stack: ['table', 'tableRow', 'tableCell'] })
    expect(out).toBe('[[Features/Wikilinks\\|Wikilinks]]')
  })

  it('does not escape the alias pipe outside of a table', () => {
    const out = handler(node, undefined, { stack: [] })
    expect(out).toBe('[[Features/Wikilinks|Wikilinks]]')
  })
})
