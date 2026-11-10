import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildWidgetDecorations } from './widget-decorations'

function lineClassStarts(doc: string): number[] {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: GFM })] })
  const { decorations } = buildWidgetDecorations(state, { vaultId: 'v1' })
  return decorations
    .filter((d) => (d.value.spec as { class?: string }).class === 'HyperMD-math')
    .map((d) => d.from)
    .sort((a, b) => a - b)
}

describe('block math line class (Obsidian 1.14)', () => {
  it('marks every line of a multi-line $$ block with HyperMD-math', () => {
    const doc = 'text\n\n$$\na = b\nc = d\n$$\n\nafter'
    const lines = doc.split('\n')
    const starts: number[] = []
    let pos = 0
    for (const l of lines) {
      starts.push(pos)
      pos += l.length + 1
    }
    // lines 2..5 (0-based) are the block: "$$", "a = b", "c = d", "$$"
    expect(lineClassStarts(doc)).toEqual([starts[2], starts[3], starts[4], starts[5]])
  })

  it('marks the single line of an inline-style $$...$$ block', () => {
    expect(lineClassStarts('$$x^2$$')).toEqual([0])
  })

  it('adds nothing when there is no block math', () => {
    expect(lineClassStarts('just text\n\nmore')).toEqual([])
  })
})
