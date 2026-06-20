import { describe, it, expect } from 'vitest'
import { parseCanvas } from './parser'
import { serializeCanvas } from './serializer'

describe('parseCanvas', () => {
  describe('valid documents', () => {
    it('should parse a minimal empty canvas', () => {
      const json = JSON.stringify({ nodes: [], edges: [] })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      expect(result.document).toEqual({ nodes: [], edges: [], _unknown: undefined })
    })

    it('should parse a text node', () => {
      const json = JSON.stringify({
        nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 400, height: 200, text: '# Hello' }],
        edges: [],
      })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      expect(result.document!.nodes).toHaveLength(1)
      expect(result.document!.nodes[0]).toEqual({
        id: 'n1', type: 'text', x: 0, y: 0, width: 400, height: 200, text: '# Hello',
        color: undefined, _unknown: undefined,
      })
    })

    it('should parse a file node', () => {
      const json = JSON.stringify({
        nodes: [{ id: 'n2', type: 'file', x: 100, y: 50, width: 300, height: 150, file: 'Notes/Project.md', subpath: '#heading' }],
        edges: [],
      })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      const node = result.document!.nodes[0]
      expect(node.type).toBe('file')
      if (node.type === 'file') {
        expect(node.file).toBe('Notes/Project.md')
        expect(node.subpath).toBe('#heading')
      }
    })

    it('should parse a link node', () => {
      const json = JSON.stringify({
        nodes: [{ id: 'n3', type: 'link', x: 0, y: 0, width: 400, height: 100, url: 'https://example.com' }],
        edges: [],
      })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      const node = result.document!.nodes[0]
      expect(node.type).toBe('link')
      if (node.type === 'link') {
        expect(node.url).toBe('https://example.com')
      }
    })

    it('should parse a group node', () => {
      const json = JSON.stringify({
        nodes: [{ id: 'g1', type: 'group', x: -50, y: -50, width: 1000, height: 500, label: 'Overview', color: '1' }],
        edges: [],
      })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      const node = result.document!.nodes[0]
      expect(node.type).toBe('group')
      if (node.type === 'group') {
        expect(node.label).toBe('Overview')
        expect(node.color).toBe('1')
      }
    })

    it('should parse edges with all fields', () => {
      const json = JSON.stringify({
        nodes: [
          { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'A' },
          { id: 'b', type: 'text', x: 200, y: 0, width: 100, height: 100, text: 'B' },
        ],
        edges: [
          { id: 'e1', fromNode: 'a', fromSide: 'right', fromEnd: 'none', toNode: 'b', toSide: 'left', toEnd: 'arrow', color: '2', label: 'connects' },
        ],
      })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      expect(result.document!.edges).toHaveLength(1)
      const edge = result.document!.edges[0]
      expect(edge.fromNode).toBe('a')
      expect(edge.fromSide).toBe('right')
      expect(edge.fromEnd).toBe('none')
      expect(edge.toNode).toBe('b')
      expect(edge.toSide).toBe('left')
      expect(edge.toEnd).toBe('arrow')
      expect(edge.color).toBe('2')
      expect(edge.label).toBe('connects')
    })

    it('should parse node with color', () => {
      const json = JSON.stringify({
        nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'hi', color: '3' }],
        edges: [],
      })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      expect(result.document!.nodes[0].color).toBe('3')
    })
  })

  describe('forward compatibility', () => {
    it('should preserve unknown top-level properties', () => {
      const json = JSON.stringify({ nodes: [], edges: [], version: '1.0', customField: true })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      expect(result.document!._unknown).toEqual({ version: '1.0', customField: true })
    })

    it('should preserve unknown node properties', () => {
      const json = JSON.stringify({
        nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'hi', futureField: 'value' }],
        edges: [],
      })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      expect(result.document!.nodes[0]._unknown).toEqual({ futureField: 'value' })
    })

    it('should preserve unknown edge properties', () => {
      const json = JSON.stringify({
        nodes: [
          { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'A' },
          { id: 'b', type: 'text', x: 200, y: 0, width: 100, height: 100, text: 'B' },
        ],
        edges: [{ id: 'e1', fromNode: 'a', fromSide: 'right', toNode: 'b', toSide: 'left', futureEdgeProp: 42 }],
      })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      expect(result.document!.edges[0]._unknown).toEqual({ futureEdgeProp: 42 })
    })

    it('should skip unknown node types without error', () => {
      const json = JSON.stringify({
        nodes: [
          { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'valid' },
          { id: 'n2', type: 'future_type', x: 0, y: 0, width: 100, height: 100 },
        ],
        edges: [],
      })
      const result = parseCanvas(json)
      expect(result.success).toBe(true)
      expect(result.document!.nodes).toHaveLength(1)
      expect(result.document!.nodes[0].id).toBe('n1')
    })
  })

  describe('validation errors', () => {
    it('should fail on invalid JSON', () => {
      const result = parseCanvas('not valid json {{{')
      expect(result.success).toBe(false)
      expect(result.errors![0].message).toContain('JSON parse error')
    })

    it('should fail on missing nodes array', () => {
      const result = parseCanvas(JSON.stringify({ edges: [] }))
      expect(result.success).toBe(false)
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('should fail on missing edges array', () => {
      const result = parseCanvas(JSON.stringify({ nodes: [] }))
      expect(result.success).toBe(false)
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('should report error for node missing required id', () => {
      const json = JSON.stringify({
        nodes: [{ type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'no id' }],
        edges: [],
      })
      const result = parseCanvas(json)
      // Node without id is invalid, parser reports error
      expect(result.errors).toBeDefined()
      expect(result.errors!.some((e) => e.path?.includes('nodes[0]'))).toBe(true)
    })

    it('should report error for node missing required x/y/width/height', () => {
      const json = JSON.stringify({
        nodes: [{ id: 'n1', type: 'text', text: 'missing coords' }],
        edges: [],
      })
      const result = parseCanvas(json)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('should report duplicate node IDs', () => {
      const json = JSON.stringify({
        nodes: [
          { id: 'dup', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'first' },
          { id: 'dup', type: 'text', x: 50, y: 50, width: 100, height: 100, text: 'second' },
        ],
        edges: [],
      })
      const result = parseCanvas(json)
      expect(result.errors).toBeDefined()
      expect(result.errors!.some((e) => e.message.includes('Duplicate node ID'))).toBe(true)
    })

    it('should report invalid edge references', () => {
      const json = JSON.stringify({
        nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'A' }],
        edges: [{ id: 'e1', fromNode: 'a', fromSide: 'right', toNode: 'nonexistent', toSide: 'left' }],
      })
      const result = parseCanvas(json)
      expect(result.success).toBe(true) // Still succeeds with warnings
      expect(result.errors).toBeDefined()
      expect(result.errors!.some((e) => e.message.includes('non-existent toNode'))).toBe(true)
    })

    it('should report invalid edge side values', () => {
      const json = JSON.stringify({
        nodes: [
          { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'A' },
          { id: 'b', type: 'text', x: 200, y: 0, width: 100, height: 100, text: 'B' },
        ],
        edges: [{ id: 'e1', fromNode: 'a', fromSide: 'invalid_side', toNode: 'b', toSide: 'left' }],
      })
      const result = parseCanvas(json)
      expect(result.errors).toBeDefined()
    })

    it('should handle non-object node entries', () => {
      const json = JSON.stringify({
        nodes: ['not an object', 42, null],
        edges: [],
      })
      const result = parseCanvas(json)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })
  })

  describe('round-trip (parse → serialize → parse)', () => {
    it('should produce identical documents after round-trip', () => {
      const original = JSON.stringify({
        nodes: [
          { id: 'abc123', type: 'text', x: 0, y: 0, width: 400, height: 200, text: '# Titel\n\nInhalt' },
          { id: 'def456', type: 'file', x: 500, y: 0, width: 400, height: 200, file: 'Notizen/Projekt.md' },
          { id: 'ghi789', type: 'link', x: 0, y: 300, width: 400, height: 100, url: 'https://example.com' },
          { id: 'grp001', type: 'group', x: -50, y: -50, width: 1000, height: 500, label: 'Projektübersicht', color: '1' },
        ],
        edges: [
          { id: 'edge01', fromNode: 'abc123', fromSide: 'right', toNode: 'def456', toSide: 'left', toEnd: 'arrow' },
        ],
      })

      const parsed1 = parseCanvas(original)
      expect(parsed1.success).toBe(true)

      const serialized = serializeCanvas(parsed1.document!)
      const parsed2 = parseCanvas(serialized)
      expect(parsed2.success).toBe(true)

      // Compare documents structurally
      expect(parsed2.document!.nodes).toHaveLength(parsed1.document!.nodes.length)
      expect(parsed2.document!.edges).toHaveLength(parsed1.document!.edges.length)

      for (let i = 0; i < parsed1.document!.nodes.length; i++) {
        const n1 = parsed1.document!.nodes[i]
        const n2 = parsed2.document!.nodes[i]
        expect(n2.id).toBe(n1.id)
        expect(n2.type).toBe(n1.type)
        expect(n2.x).toBe(n1.x)
        expect(n2.y).toBe(n1.y)
        expect(n2.width).toBe(n1.width)
        expect(n2.height).toBe(n1.height)
      }
    })

    it('should preserve unknown fields through round-trip', () => {
      const original = JSON.stringify({
        nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'hi', customProp: 'preserved' }],
        edges: [],
        topLevelUnknown: { nested: true },
      })

      const parsed = parseCanvas(original)
      expect(parsed.success).toBe(true)

      const serialized = serializeCanvas(parsed.document!)
      const reparsed = parseCanvas(serialized)
      expect(reparsed.success).toBe(true)
      expect(reparsed.document!.nodes[0]._unknown).toEqual({ customProp: 'preserved' })
      expect(reparsed.document!._unknown).toEqual({ topLevelUnknown: { nested: true } })
    })
  })
})

describe('serializeCanvas', () => {
  it('should produce valid JSON', () => {
    const doc = { nodes: [], edges: [] }
    const result = serializeCanvas(doc)
    expect(() => JSON.parse(result)).not.toThrow()
  })

  it('should serialize all node types correctly', () => {
    const doc = {
      nodes: [
        { id: 'n1', type: 'text' as const, x: 0, y: 0, width: 100, height: 100, text: 'Hello' },
        { id: 'n2', type: 'file' as const, x: 200, y: 0, width: 100, height: 100, file: 'test.md', subpath: '#h1' },
        { id: 'n3', type: 'link' as const, x: 400, y: 0, width: 100, height: 100, url: 'https://x.com' },
        { id: 'n4', type: 'group' as const, x: -10, y: -10, width: 500, height: 300, label: 'Group' },
      ],
      edges: [],
    }
    const result = serializeCanvas(doc)
    const parsed = JSON.parse(result)
    expect(parsed.nodes).toHaveLength(4)
    expect(parsed.nodes[0].text).toBe('Hello')
    expect(parsed.nodes[1].file).toBe('test.md')
    expect(parsed.nodes[1].subpath).toBe('#h1')
    expect(parsed.nodes[2].url).toBe('https://x.com')
    expect(parsed.nodes[3].label).toBe('Group')
  })

  it('should serialize edges correctly', () => {
    const doc = {
      nodes: [
        { id: 'a', type: 'text' as const, x: 0, y: 0, width: 100, height: 100, text: 'A' },
        { id: 'b', type: 'text' as const, x: 200, y: 0, width: 100, height: 100, text: 'B' },
      ],
      edges: [
        { id: 'e1', fromNode: 'a', fromSide: 'right' as const, toNode: 'b', toSide: 'left' as const, toEnd: 'arrow' as const, label: 'test' },
      ],
    }
    const result = serializeCanvas(doc)
    const parsed = JSON.parse(result)
    expect(parsed.edges[0].fromNode).toBe('a')
    expect(parsed.edges[0].toEnd).toBe('arrow')
    expect(parsed.edges[0].label).toBe('test')
  })

  it('should omit undefined optional fields', () => {
    const doc = {
      nodes: [{ id: 'n1', type: 'text' as const, x: 0, y: 0, width: 100, height: 100, text: 'hi' }],
      edges: [],
    }
    const result = serializeCanvas(doc)
    const parsed = JSON.parse(result)
    expect('color' in parsed.nodes[0]).toBe(false)
    expect('subpath' in parsed.nodes[0]).toBe(false)
  })
})
