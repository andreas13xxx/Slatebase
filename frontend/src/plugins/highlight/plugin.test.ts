import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'
import { remarkHighlight, type HighlightNode } from './plugin'

function parse(md: string): Root {
  const tree = unified().use(remarkParse).parse(md)
  return unified().use(remarkHighlight).runSync(tree) as Root
}

function highlights(md: string): HighlightNode[] {
  const found: HighlightNode[] = []
  visit(parse(md), 'highlight' as 'text', (n) => {
    found.push(n as unknown as HighlightNode)
  })
  return found
}

describe('remarkHighlight', () => {
  it('rewrites a plain ==text== into a yellow highlight node', () => {
    const hits = highlights('a ==marked== b')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.color).toBe('yellow')
    expect(hits[0]!.data?.hName).toBe('mark')
    expect(hits[0]!.data?.hProperties).toEqual({ className: 'hl-yellow' })
  })

  it('resolves a leading color emoji', () => {
    const hits = highlights('==🟢 done==')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.color).toBe('green')
    expect(hits[0]!.data?.hProperties).toEqual({ className: 'hl-green' })
  })

  it('keeps the emoji inside the rendered content', () => {
    const hits = highlights('==🔴 danger==')
    const text = (hits[0]!.children[0] as { value: string }).value
    expect(text).toBe('🔴 danger')
  })

  it('handles multiple highlights in one paragraph', () => {
    const hits = highlights('==one== and ==🔵 two==')
    expect(hits.map((h) => h.color)).toEqual(['yellow', 'blue'])
  })

  it('does not create a highlight for empty markers', () => {
    expect(highlights('==== nothing')).toHaveLength(0)
  })

  it('leaves ==text== inside inline code untouched', () => {
    expect(highlights('`==code==`')).toHaveLength(0)
  })

  it('leaves ==text== inside a fenced code block untouched', () => {
    expect(highlights('```\n==code==\n```')).toHaveLength(0)
  })

  it('preserves surrounding text around a highlight', () => {
    const tree = parse('before ==mid== after')
    const para = tree.children[0] as { children: Array<{ type: string; value?: string }> }
    const texts = para.children.filter((c) => c.type === 'text').map((c) => c.value)
    expect(texts).toContain('before ')
    expect(texts).toContain(' after')
  })
})
