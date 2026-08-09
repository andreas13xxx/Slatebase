import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildInlineDecorations } from './inline-decorations'

/** Builds an EditorState with the same markdown/GFM setup used by CodeMirrorEditor.tsx. */
function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ extensions: GFM })] })
}

/** Extracts the { from, to, style } of every mark-type decoration for inspection. */
function markRanges(state: EditorState, result: ReturnType<typeof buildInlineDecorations>) {
  return result.decorations
    .map((r) => {
      const spec = r.value.spec as { attributes?: { style?: string }; class?: string }
      if (spec.attributes === undefined && spec.class === undefined) return null // Decoration.replace
      return { from: r.from, to: r.to, text: state.doc.sliceString(r.from, r.to), style: spec.attributes?.style }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

describe('buildInlineDecorations — inline HTML tag pairs', () => {
  it('decorates the content between an allowlisted <font color> pair with a CSS style', () => {
    const state = makeState('Hello <font color="#ff0000">Testtest</font> world')
    const result = buildInlineDecorations(state)
    const marks = markRanges(state, result)
    const fontMark = marks.find((m) => m.text === 'Testtest')
    expect(fontMark).toBeDefined()
    expect(fontMark?.style).toContain('color: #ff0000')
  })

  it('hides the opening and closing tag syntax as replace decorations', () => {
    const state = makeState('<font color="#ff0000">Testtest</font>')
    const result = buildInlineDecorations(state)
    const replaceRanges = result.decorations.filter((r) => {
      const spec = r.value.spec as { attributes?: unknown; class?: unknown }
      return spec.attributes === undefined && spec.class === undefined
    })
    const openTag = replaceRanges.find((r) => state.doc.sliceString(r.from, r.to) === '<font color="#ff0000">')
    const closeTag = replaceRanges.find((r) => state.doc.sliceString(r.from, r.to) === '</font>')
    expect(openTag).toBeDefined()
    expect(closeTag).toBeDefined()
  })

  it('registers hideable ranges for the tag pair, grouped so the cursor reveals both together', () => {
    const state = makeState('<mark>hi</mark>')
    const result = buildInlineDecorations(state)
    expect(result.hideableRanges.length).toBeGreaterThanOrEqual(2)
    const groups = new Set(result.hideableRanges.map((r) => `${r.groupFrom}:${r.groupTo}`))
    expect(groups.size).toBe(1)
  })

  it('applies bold styling for a <b> pair', () => {
    const state = makeState('<b>bold text</b>')
    const result = buildInlineDecorations(state)
    const marks = markRanges(state, result)
    const mark = marks.find((m) => m.text === 'bold text')
    expect(mark?.style).toContain('font-weight: bold')
  })

  it('does not decorate a non-allowlisted tag like <script>', () => {
    const state = makeState('before <script>alert(1)</script> after')
    const result = buildInlineDecorations(state)
    const marks = markRanges(state, result)
    expect(marks.find((m) => m.text === 'alert(1)')).toBeUndefined()
  })

  it('does not decorate an unpaired inline tag', () => {
    const state = makeState('<font color="red">unterminated')
    const result = buildInlineDecorations(state)
    const marks = markRanges(state, result)
    expect(marks.find((m) => m.text.includes('unterminated'))).toBeUndefined()
  })

  it('drops a style value containing javascript: from a <span>', () => {
    const state = makeState('<span style="color: red; background: url(javascript:alert(1))">text</span>')
    const result = buildInlineDecorations(state)
    const marks = markRanges(state, result)
    const mark = marks.find((m) => m.text === 'text')
    expect(mark?.style ?? '').toBe('')
  })
})
