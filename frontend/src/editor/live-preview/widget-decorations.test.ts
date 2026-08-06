import { describe, it, expect } from 'vitest'
import { parseTableRow, renderCellInline } from './widget-decorations'

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
