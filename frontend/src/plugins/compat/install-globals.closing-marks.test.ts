import { describe, it, expect } from 'vitest'
import { markdownLanguage } from '@codemirror/lang-markdown'
import type { Tree } from '@lezer/common'
import { createObsidianCompatSyntaxTree } from './install-globals'
import { tokenClassNodeProp, tokenClassNodePropSource, closingTokenClass } from '../../editor/token-class-node-prop'

/** Class lists of every mark node, in document order, as a plugin sees them through the compat syntaxTree(). */
function markClasses(doc: string): Array<{ name: string; text: string; classes: string[] }> {
  const parser = (markdownLanguage.parser as unknown as { configure(spec: Record<string, unknown>): { parse(input: string): Tree } })
    .configure({ props: [tokenClassNodePropSource] })
  const tree = parser.parse(doc)
  const compat = createObsidianCompatSyntaxTree((() => tree) as never)({} as never)
  const out: Array<{ name: string; text: string; classes: string[] }> = []
  compat.iterate({
    enter(node: { name: string; from: number; to: number; type: { prop(p: typeof tokenClassNodeProp): string | undefined } }) {
      if (node.name === 'CodeMark' || node.name === 'EmphasisMark') {
        out.push({ name: node.name, text: doc.slice(node.from, node.to), classes: (node.type.prop(tokenClassNodeProp) ?? '').split(' ') })
      }
    },
  })
  return out
}

describe('closing formatting marks (Obsidian 1.15 formatting-*-end)', () => {
  it('gives only the closing backtick the formatting-code-end class', () => {
    const [open, close] = markClasses('a `code` b')
    expect(open!.classes).toEqual(['inline-code', 'formatting', 'formatting-code'])
    expect(close!.classes).toEqual(['inline-code', 'formatting', 'formatting-code', 'formatting-code-end'])
  })

  it('gives only the closing emphasis mark the formatting-em-end class', () => {
    const marks = markClasses('x *em* y')
    expect(marks).toHaveLength(2)
    expect(marks[0]!.classes).not.toContain('formatting-em-end')
    expect(marks[1]!.classes).toContain('formatting-em-end')
  })

  it('marks the last of the doubled marks of **strong** as closing', () => {
    const marks = markClasses('x **bold** y')
    expect(marks.filter((m) => m.classes.includes('formatting-em-end'))).toHaveLength(1)
    expect(marks[marks.length - 1]!.classes).toContain('formatting-em-end')
  })

  it('keeps the recommended match (formatting-code) working for opening and closing marks', () => {
    for (const m of markClasses('`x`')) expect(m.classes).toContain('formatting-code')
  })

  it('restores the cursor type after the callback (no leak into later nodes)', () => {
    const marks = markClasses('`a` and `b`')
    expect(marks.map((m) => m.classes.includes('formatting-code-end'))).toEqual([false, true, false, true])
  })

  it('has no closing variant for other node kinds', () => {
    expect(closingTokenClass('HeaderMark')).toBeUndefined()
    expect(closingTokenClass('CodeMark')).toBe('inline-code formatting formatting-code formatting-code-end')
  })
})
