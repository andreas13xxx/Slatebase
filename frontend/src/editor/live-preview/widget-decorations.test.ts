import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { parseTableRow, renderCellInline, buildWidgetDecorations } from './widget-decorations'

/** Builds an EditorState with the same markdown/GFM setup used by CodeMirrorEditor.tsx. */
function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ extensions: GFM })] })
}

describe('parseTableRow', () => {
  it('splits a simple row on unescaped pipes', () => {
    expect(parseTableRow('| Guide | Beschreibung |')).toEqual([' Guide ', ' Beschreibung '])
  })

  it('does not split on a backslash-escaped pipe', () => {
    const cells = parseTableRow('| [[Features/Wikilinks\\|Wikilinks]] | Notizen miteinander verlinken |')
    expect(cells).toHaveLength(2)
    expect(cells[0]).toBe(' [[Features/Wikilinks\\|Wikilinks]] ')
    expect(cells[1]).toBe(' Notizen miteinander verlinken ')
  })

  it('handles multiple escaped pipes across cells', () => {
    const cells = parseTableRow('| [[A\\|B]] | [[C\\|D]] |')
    expect(cells).toEqual([' [[A\\|B]] ', ' [[C\\|D]] '])
  })

  it('does not produce an empty column from the optional outer pipes', () => {
    expect(parseTableRow('a | b')).toEqual(['a ', ' b'])
  })
})

describe('renderCellInline', () => {
  it('renders plain text as-is', () => {
    const el = document.createElement('td')
    renderCellInline(el, 'Notizen miteinander verlinken')
    expect(el.textContent).toBe('Notizen miteinander verlinken')
    expect(el.querySelector('.cm-lp-wikilink')).toBeNull()
  })

  it('renders an escaped-pipe wikilink as a clickable span with the correct target', () => {
    const el = document.createElement('td')
    renderCellInline(el, '[[Features/Wikilinks\\|Wikilinks]]')

    const link = el.querySelector('.cm-lp-wikilink')
    expect(link).not.toBeNull()
    expect(link!.textContent).toBe('Wikilinks')
    expect(link!.getAttribute('data-target')).toBe('Features/Wikilinks')
  })

  it('renders surrounding text alongside the wikilink span', () => {
    const el = document.createElement('td')
    renderCellInline(el, 'See [[Page]] for details')

    expect(el.childNodes).toHaveLength(3)
    expect(el.childNodes[0]!.textContent).toBe('See ')
    expect((el.childNodes[1] as HTMLElement).className).toBe('cm-lp-wikilink')
    expect(el.childNodes[2]!.textContent).toBe(' for details')
  })

  it('renders a plain (non-aliased) wikilink target as the visible text', () => {
    const el = document.createElement('td')
    renderCellInline(el, '[[Features/Wikilinks]]')

    const link = el.querySelector('.cm-lp-wikilink')
    expect(link!.textContent).toBe('Features/Wikilinks')
    expect(link!.getAttribute('data-target')).toBe('Features/Wikilinks')
  })

  it('renders an inline code span literally, not as a wikilink', () => {
    const el = document.createElement('td')
    renderCellInline(el, '`[[Start hier\\|Startseite]]`')

    expect(el.querySelector('.cm-lp-wikilink')).toBeNull()
    const code = el.querySelector('code.cm-lp-inline-code')
    expect(code).not.toBeNull()
    expect(code!.textContent).toBe('[[Start hier\\|Startseite]]')
  })

  it('renders text and code spans around each other correctly', () => {
    const el = document.createElement('td')
    renderCellInline(el, 'See `[[Raw]]` or [[Real]] instead')

    const code = el.querySelector('code.cm-lp-inline-code')
    expect(code!.textContent).toBe('[[Raw]]')

    const link = el.querySelector('.cm-lp-wikilink')
    expect(link!.textContent).toBe('Real')
    expect(link!.getAttribute('data-target')).toBe('Real')
  })
})

describe('buildWidgetDecorations — <center> HTML block', () => {
  it('applies a centering line class to a <center>...</center> block', () => {
    const state = makeState('<center>Starte hier, um die Basics zu lernen: Testtest</center>')
    const result = buildWidgetDecorations(state, { vaultId: 'v1' })
    const lineDeco = result.decorations.find((r) => {
      const spec = r.value.spec as { attributes?: { class?: string } }
      return spec.attributes?.class === 'cm-lp-html-center'
    })
    expect(lineDeco).toBeDefined()
  })

  it('hides the opening and closing tags as replace decorations', () => {
    const state = makeState('<center>Testtest</center>')
    const result = buildWidgetDecorations(state, { vaultId: 'v1' })
    const replaceRanges = result.decorations.filter((r) => {
      const spec = r.value.spec as { attributes?: unknown; class?: unknown; widget?: unknown }
      return spec.attributes === undefined && spec.class === undefined && spec.widget === undefined
    })
    const openTag = replaceRanges.find((r) => state.doc.sliceString(r.from, r.to) === '<center>')
    const closeTag = replaceRanges.find((r) => state.doc.sliceString(r.from, r.to) === '</center>')
    expect(openTag).toBeDefined()
    expect(closeTag).toBeDefined()
  })

  it('reveals both tags together as one hideable group', () => {
    const state = makeState('<center>Testtest</center>')
    const result = buildWidgetDecorations(state, { vaultId: 'v1' })
    expect(result.hideableRanges).toHaveLength(2)
    const [open, close] = result.hideableRanges
    expect(open!.groupFrom).toBe(close!.groupFrom)
    expect(open!.groupTo).toBe(close!.groupTo)
  })

  it('does not decorate unrelated HTML blocks', () => {
    const state = makeState('<div>Testtest</div>')
    const result = buildWidgetDecorations(state, { vaultId: 'v1' })
    const centerLine = result.decorations.find((r) => {
      const spec = r.value.spec as { attributes?: { class?: string } }
      return spec.attributes?.class === 'cm-lp-html-center'
    })
    expect(centerLine).toBeUndefined()
  })
})
