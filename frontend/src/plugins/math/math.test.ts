/**
 * Tests for the math syntax plugin (micromark + mdast-util).
 */
import { describe, it, expect } from 'vitest'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { mathSyntax } from './syntax'
import { mathFromMarkdown, mathToMarkdown } from './mdast-util'
import { remarkMath } from './plugin'
import type { MathInlineNode, MathBlockNode } from './types'
import type { Root } from 'mdast'

/** Parse using just micromark (inline math only). */
function parseMicromark(input: string): Root {
  return fromMarkdown(input, {
    extensions: [mathSyntax()],
    mdastExtensions: [mathFromMarkdown()],
  })
}

/** Parse using the full remarkMath plugin (inline + block math via transformer). */
function parse(input: string): Root {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMath)
  const tree = processor.parse(input)
  return processor.runSync(tree) as Root
}

function findInline(tree: Root): MathInlineNode | undefined {
  for (const block of tree.children) {
    if ('children' in block) {
      const found = (block as { children: Array<{ type: string }> }).children.find(
        (n) => n.type === 'mathInline'
      )
      if (found) return found as unknown as MathInlineNode
    }
  }
  return undefined
}

function findBlock(tree: Root): MathBlockNode | undefined {
  return tree.children.find((n) => n.type === 'mathBlock') as unknown as MathBlockNode | undefined
}

describe('Math syntax — inline ($...$)', () => {
  it('parses basic inline math', () => {
    const tree = parse('Hello $x^2$ world')
    const node = findInline(tree)
    expect(node).toBeDefined()
    expect(node!.type).toBe('mathInline')
    expect(node!.value).toBe('x^2')
  })

  it('parses single-character inline math', () => {
    const tree = parse('$x$')
    const node = findInline(tree)
    expect(node).toBeDefined()
    expect(node!.value).toBe('x')
  })

  it('parses inline math with special characters', () => {
    const tree = parse('$\\frac{1}{2}$')
    const node = findInline(tree)
    expect(node).toBeDefined()
    expect(node!.value).toBe('\\frac{1}{2}')
  })

  it('rejects inline math with whitespace after opening $', () => {
    const tree = parse('$ x^2$')
    const node = findInline(tree)
    expect(node).toBeUndefined()
  })

  it('rejects inline math with whitespace before closing $', () => {
    const tree = parse('$x^2 $')
    const node = findInline(tree)
    expect(node).toBeUndefined()
  })

  it('rejects inline math followed by a digit', () => {
    const tree = parse('$5 discount when you spend $10')
    const node = findInline(tree)
    expect(node).toBeUndefined()
  })

  it('handles escaped dollar signs', () => {
    const tree = parse('\\$not math\\$')
    const node = findInline(tree)
    expect(node).toBeUndefined()
  })

  it('does not match across line boundaries', () => {
    const tree = parse('$start\nend$')
    const node = findInline(tree)
    expect(node).toBeUndefined()
  })

  it('handles multiple inline math in one paragraph', () => {
    const tree = parse('$a$ and $b$')
    const paragraph = tree.children[0]
    if (paragraph && 'children' in paragraph) {
      const mathNodes = (paragraph as { children: Array<{ type: string }> }).children.filter(
        (n) => n.type === 'mathInline'
      ) as unknown as MathInlineNode[]
      expect(mathNodes).toHaveLength(2)
      expect(mathNodes[0]!.value).toBe('a')
      expect(mathNodes[1]!.value).toBe('b')
    }
  })
})

describe('Math syntax — block ($$...$$)', () => {
  it('parses multiline block math', () => {
    const tree = parse('$$\nx^2 + y^2 = z^2\n$$')
    const node = findBlock(tree)
    expect(node).toBeDefined()
    expect(node!.type).toBe('mathBlock')
    expect(node!.value).toBe('x^2 + y^2 = z^2')
  })

  it('parses multi-line content in block math (no blank lines)', () => {
    const tree = parse('$$\na = 1\nb = 2\n$$')
    const node = findBlock(tree)
    expect(node).toBeDefined()
    expect(node!.value).toBe('a = 1\nb = 2')
  })

  it('handles block math with surrounding content', () => {
    const tree = parse('before\n\n$$\nE=mc^2\n$$\n\nafter')
    const node = findBlock(tree)
    expect(node).toBeDefined()
    expect(node!.value).toBe('E=mc^2')
  })
})

describe('Math serialization (toMarkdown)', () => {
  it('round-trips inline math', () => {
    const input = 'Hello $x^2$ world'
    const tree = parseMicromark(input)
    const output = toMarkdown(tree, { extensions: [mathToMarkdown()] })
    expect(output).toContain('$x^2$')
  })

  it('serializes block math node', () => {
    const tree = parse('$$\nE=mc^2\n$$')
    const node = findBlock(tree)
    expect(node).toBeDefined()
    const output = toMarkdown({ type: 'root', children: [node!] } as Root, { extensions: [mathToMarkdown()] })
    expect(output).toContain('$$\nE=mc^2\n$$')
  })
})
