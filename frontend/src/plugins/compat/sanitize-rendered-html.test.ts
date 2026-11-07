import { describe, it, expect } from 'vitest'
import { isSafeUrl } from './bases-values'
import { sanitizeRenderedHtml } from './sanitize-rendered-html'

describe('isSafeUrl', () => {
  it.each([
    'JaVaScRiPt:alert(1)',
    '\u0001javascript:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '&#106;avascript:alert(1)',
    'data:image/svg+xml;base64,AAAA',
    'vbscript:x',
    '',
  ])('rejects %j', (url) => {
    expect(isSafeUrl(url)).toBe(false)
  })

  it.each([
    'https://example.com/a',
    'HTTP://example.com',
    'mailto:a@b.c',
    'notes/x.md',
    './x.md',
    '../x.md',
    '/abs/path.md',
    '#anchor',
    '?q=1',
  ])('accepts %j', (url) => {
    expect(isSafeUrl(url)).toBe(true)
  })
})

describe('sanitizeRenderedHtml', () => {
  it('removes <style> and <form>', () => {
    const out = sanitizeRenderedHtml('<p>a</p><style>p{color:red}</style><form action="//x"><input name="q"></form>')
    expect(out).not.toContain('<style')
    expect(out).not.toContain('<form')
    expect(out).toContain('<p>a</p>')
  })

  it('removes inline style attributes', () => {
    expect(sanitizeRenderedHtml('<p style="background:url(//x)">a</p>')).toBe('<p>a</p>')
  })

  it('keeps disabled checkboxes', () => {
    const out = sanitizeRenderedHtml('<ul><li><input type="checkbox" disabled checked> t</li></ul>')
    expect(out).toContain('type="checkbox"')
    expect(out).toContain('disabled')
    expect(out).toContain('checked')
  })

  it('keeps table alignment via align attribute', () => {
    const out = sanitizeRenderedHtml('<table><tr><th align="right">a</th></tr></table>')
    expect(out).toContain('align="right"')
  })

  it('keeps callout and embed markup', () => {
    const html = '<div class="callout" data-callout="note"><div class="callout-title">T</div></div><a class="internal-link" data-href="N" href="#">N</a>'
    const out = sanitizeRenderedHtml(html)
    expect(out).toContain('class="callout"')
    expect(out).toContain('data-callout="note"')
    expect(out).toContain('data-href="N"')
  })
})
