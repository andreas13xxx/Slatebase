import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildInlineDecorations } from './inline-decorations'
import { buildWidgetDecorations } from './widget-decorations'

/**
 * Obsidian parity classes (`HyperMD-*`, `cm-*`) next to Slatebase's own `cm-lp-*` classes.
 * Themes key rules on them; Slatebase's own classes must stay so its look without a theme is unchanged.
 */

function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ extensions: GFM })] })
}

/** Class lists of all decorations (line and mark) whose range starts on the given line text. */
function classesOn(state: EditorState, decos: { from: number; to: number; value: { spec: unknown } }[], lineText: string) {
  const out: string[][] = []
  for (const d of decos) {
    const spec = d.value.spec as { class?: string; attributes?: { class?: string } }
    const cls = spec.class ?? spec.attributes?.class
    if (!cls) continue
    if (state.doc.lineAt(d.from).text === lineText) out.push(cls.split(' '))
  }
  return out.flat()
}

describe('Obsidian parity classes in Live Preview', () => {
  it.each([1, 2, 3, 4, 5, 6])('heading level %i gets HyperMD-header and HyperMD-header-N', (level) => {
    const line = `${'#'.repeat(level)} Title`
    const state = makeState(line)
    const cls = classesOn(state, buildInlineDecorations(state).decorations, line)
    expect(cls).toContain(`cm-lp-h${level}`)
    expect(cls).toContain('HyperMD-header')
    expect(cls).toContain(`HyperMD-header-${level}`)
  })

  it('marks the heading marker as cm-formatting', () => {
    const state = makeState('## Title')
    expect(classesOn(state, buildInlineDecorations(state).decorations, '## Title')).toContain('cm-formatting')
  })

  it('inline code, highlight and tag keep their cm-lp class and gain the Obsidian one', () => {
    const line = 'a `code` ==mark== #tag'
    const state = makeState(line)
    const cls = classesOn(state, buildInlineDecorations(state).decorations, line)
    for (const c of ['cm-lp-inline-code', 'cm-inline-code', 'cm-formatting-code', 'cm-lp-highlight', 'cm-highlight', 'cm-lp-tag', 'cm-hashtag']) {
      expect(cls, c).toContain(c)
    }
  })

  it('inline code: only the content carries cm-inline-code, the backticks carry cm-formatting-code', () => {
    const state = makeState('a `code` b')
    const decos = buildInlineDecorations(state).decorations
    const withClass = (cls: string) =>
      decos
        .filter((d) => ((d.value.spec as { class?: string }).class ?? '').split(' ').includes(cls))
        .map((d) => state.doc.sliceString(d.from, d.to))
    expect(withClass('cm-inline-code')).toEqual(['code'])
    expect(withClass('cm-formatting-code')).toEqual(['`', '`'])
    expect(withClass('cm-lp-inline-code')).toEqual(['`code`'])
  })

  it('fenced code lines get HyperMD-codeblock(-bg) and begin/end on the first and last line', () => {
    const lines = ['```js', 'let a = 1', '```']
    const state = makeState(lines.join('\n'))
    const decos = buildWidgetDecorations(state, { vaultId: 'v1' }).decorations
    const first = classesOn(state, decos, lines[0]!)
    const mid = classesOn(state, decos, lines[1]!)
    const last = classesOn(state, decos, lines[2]!)
    for (const c of [first, mid, last]) {
      expect(c).toContain('cm-lp-code-block-line')
      expect(c).toContain('HyperMD-codeblock')
      expect(c).toContain('HyperMD-codeblock-bg')
    }
    expect(first).toContain('HyperMD-codeblock-begin')
    expect(first).not.toContain('HyperMD-codeblock-end')
    expect(mid).not.toContain('HyperMD-codeblock-begin')
    expect(mid).not.toContain('HyperMD-codeblock-end')
    expect(last).toContain('HyperMD-codeblock-end')
  })

  it('blockquote lines get HyperMD-quote', () => {
    const state = makeState('> quoted')
    const cls = classesOn(state, buildWidgetDecorations(state, { vaultId: 'v1' }).decorations, '> quoted')
    expect(cls).toContain('cm-lp-blockquote')
    expect(cls).toContain('HyperMD-quote')
  })

  it('task lines get HyperMD-task-line, plain list items do not', () => {
    const state = makeState('- [ ] todo\n- plain')
    const decos = buildWidgetDecorations(state, { vaultId: 'v1' }).decorations
    expect(classesOn(state, decos, '- [ ] todo')).toContain('HyperMD-task-line')
    expect(classesOn(state, decos, '- plain')).not.toContain('HyperMD-task-line')
  })
})
