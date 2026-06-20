/**
 * Unit tests for canvas file-reference extractor.
 */

import { describe, it, expect } from 'vitest'
import { extractCanvasFileRefs } from './canvas-parser.js'

describe('extractCanvasFileRefs', () => {
  it('should extract file paths from file-type nodes', () => {
    const content = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'file', x: 0, y: 0, width: 400, height: 200, file: 'Notes/Project.md' },
        { id: 'n2', type: 'file', x: 500, y: 0, width: 400, height: 200, file: 'Images/diagram.png' },
      ],
      edges: [],
    })

    const refs = extractCanvasFileRefs(content)
    expect(refs).toEqual(['Notes/Project.md', 'Images/diagram.png'])
  })

  it('should return empty array for canvas with no file nodes', () => {
    const content = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'text', x: 0, y: 0, width: 400, height: 200, text: 'Hello' },
        { id: 'n2', type: 'link', x: 0, y: 300, width: 400, height: 100, url: 'https://example.com' },
      ],
      edges: [],
    })

    const refs = extractCanvasFileRefs(content)
    expect(refs).toEqual([])
  })

  it('should return empty array for empty canvas', () => {
    const content = JSON.stringify({ nodes: [], edges: [] })
    const refs = extractCanvasFileRefs(content)
    expect(refs).toEqual([])
  })

  it('should return empty array for invalid JSON', () => {
    const refs = extractCanvasFileRefs('not valid json {{{')
    expect(refs).toEqual([])
  })

  it('should return empty array when nodes is not an array', () => {
    const content = JSON.stringify({ nodes: 'invalid', edges: [] })
    const refs = extractCanvasFileRefs(content)
    expect(refs).toEqual([])
  })

  it('should return empty array when input is null', () => {
    const refs = extractCanvasFileRefs('null')
    expect(refs).toEqual([])
  })

  it('should skip file nodes with empty file field', () => {
    const content = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'file', x: 0, y: 0, width: 100, height: 100, file: '' },
        { id: 'n2', type: 'file', x: 200, y: 0, width: 100, height: 100, file: 'valid.md' },
      ],
      edges: [],
    })

    const refs = extractCanvasFileRefs(content)
    expect(refs).toEqual(['valid.md'])
  })

  it('should skip non-object nodes', () => {
    const content = JSON.stringify({
      nodes: [null, 42, 'string', { id: 'n1', type: 'file', x: 0, y: 0, width: 100, height: 100, file: 'test.md' }],
      edges: [],
    })

    const refs = extractCanvasFileRefs(content)
    expect(refs).toEqual(['test.md'])
  })

  it('should handle mixed node types and only extract file refs', () => {
    const content = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 100, text: '# Title' },
        { id: 'n2', type: 'file', x: 200, y: 0, width: 100, height: 100, file: 'Notes/Meeting.md' },
        { id: 'n3', type: 'link', x: 400, y: 0, width: 100, height: 100, url: 'https://example.com' },
        { id: 'n4', type: 'group', x: -50, y: -50, width: 600, height: 300, label: 'Group' },
        { id: 'n5', type: 'file', x: 200, y: 200, width: 100, height: 100, file: 'Attachments/image.png' },
      ],
      edges: [
        { id: 'e1', fromNode: 'n1', fromSide: 'right', toNode: 'n2', toSide: 'left' },
      ],
    })

    const refs = extractCanvasFileRefs(content)
    expect(refs).toEqual(['Notes/Meeting.md', 'Attachments/image.png'])
  })

  it('should handle file node with non-string file field', () => {
    const content = JSON.stringify({
      nodes: [
        { id: 'n1', type: 'file', x: 0, y: 0, width: 100, height: 100, file: 123 },
      ],
      edges: [],
    })

    const refs = extractCanvasFileRefs(content)
    expect(refs).toEqual([])
  })
})
