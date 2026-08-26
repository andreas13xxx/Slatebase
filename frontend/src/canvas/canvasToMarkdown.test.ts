import { describe, it, expect } from 'vitest'
import { canvasToMarkdown } from './canvasToMarkdown'
import type { CanvasDocument, CanvasNode } from './types'

function makeDoc(nodes: CanvasNode[]): CanvasDocument {
  return { nodes, edges: [] }
}

describe('canvasToMarkdown', () => {
  it('renders a text node verbatim', () => {
    const doc = makeDoc([
      { id: '1', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'Hello **world**' },
    ])
    expect(canvasToMarkdown(doc)).toBe('Hello **world**')
  })

  it('renders a file node as an embed, including subpath', () => {
    const doc = makeDoc([
      { id: '1', type: 'file', x: 0, y: 0, width: 100, height: 100, file: 'Notes/Foo.md' },
      { id: '2', type: 'file', x: 0, y: 200, width: 100, height: 100, file: 'Notes/Bar.md', subpath: 'Heading' },
    ])
    expect(canvasToMarkdown(doc)).toBe('![[Notes/Foo.md]]\n\n![[Notes/Bar.md#Heading]]')
  })

  it('renders a link node as a Markdown link', () => {
    const doc = makeDoc([
      { id: '1', type: 'link', x: 0, y: 0, width: 100, height: 100, url: 'https://example.com' },
    ])
    expect(canvasToMarkdown(doc)).toBe('[https://example.com](https://example.com)')
  })

  it('renders a group node as a heading, falling back to "Group" with no label', () => {
    const doc = makeDoc([
      { id: '1', type: 'group', x: 0, y: 0, width: 100, height: 100, label: 'Ideas' },
      { id: '2', type: 'group', x: 0, y: 200, width: 100, height: 100 },
    ])
    expect(canvasToMarkdown(doc)).toBe('## Ideas\n\n## Group')
  })

  it('orders nodes top-to-bottom, then left-to-right, regardless of array order', () => {
    const doc = makeDoc([
      { id: 'bottom-right', type: 'text', x: 100, y: 100, width: 10, height: 10, text: 'D' },
      { id: 'top-left', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'A' },
      { id: 'top-right', type: 'text', x: 100, y: 0, width: 10, height: 10, text: 'B' },
      { id: 'bottom-left', type: 'text', x: 0, y: 100, width: 10, height: 10, text: 'C' },
    ])
    expect(canvasToMarkdown(doc)).toBe('A\n\nB\n\nC\n\nD')
  })

  it('drops empty text nodes and returns an empty string for an empty canvas', () => {
    expect(canvasToMarkdown(makeDoc([]))).toBe('')
    expect(canvasToMarkdown(makeDoc([{ id: '1', type: 'text', x: 0, y: 0, width: 10, height: 10, text: '   ' }]))).toBe('')
  })
})
