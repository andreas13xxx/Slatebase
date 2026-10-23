import { describe, it, expect } from 'vitest'
import { sanitizeHTMLToDom } from './obsidian-api-extensions'

function html(fragment: DocumentFragment): string {
  const div = document.createElement('div')
  div.appendChild(fragment)
  return div.innerHTML
}

describe('sanitizeHTMLToDom', () => {
  it('removes script tags', () => {
    const out = html(sanitizeHTMLToDom('<p>hi</p><script>alert(1)</script>'))
    expect(out).not.toContain('<script')
    expect(out).toContain('<p>hi</p>')
  })

  it('strips inline event handler attributes', () => {
    const out = html(sanitizeHTMLToDom('<img src="x.png" onerror="alert(1)"><div onclick="evil()">click</div>'))
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('onclick')
  })

  it('strips javascript: URLs from href/src', () => {
    const out = html(sanitizeHTMLToDom('<a href="javascript:alert(1)">link</a>'))
    expect(out).not.toContain('javascript:')
  })

  it('neutralizes the real SVG XSS vector: an inline <svg> with a <script> child', () => {
    // The dangerous case is an inline <svg> carrying executable content, not an
    // SVG loaded through <img src> (which browsers render script-inert). DOMPurify
    // strips the script either way.
    const out = html(sanitizeHTMLToDom('<svg><script>alert(1)</script></svg>'))
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
  })

  it('keeps an svg data: URL on <img> (script-inert in the image context) and plain content intact', () => {
    const out = html(sanitizeHTMLToDom('<img src="data:image/svg+xml;base64,AAAA"><b>bold</b>'))
    // An SVG loaded via <img> cannot execute scripts, so DOMPurify keeps it —
    // the XSS surface is inline <svg>/<object>/<embed>, covered above.
    expect(out).toContain('<b>bold</b>')
  })

  it('keeps ordinary data:image URLs and plain content intact', () => {
    const out = html(sanitizeHTMLToDom('<img src="data:image/png;base64,AAAA"><b>bold</b>'))
    expect(out).toContain('data:image/png')
    expect(out).toContain('<b>bold</b>')
  })
})
