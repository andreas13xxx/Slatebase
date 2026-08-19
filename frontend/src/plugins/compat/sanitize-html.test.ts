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

  it('strips data:image/svg+xml URLs (can carry an embedded <script>)', () => {
    const out = html(sanitizeHTMLToDom('<img src="data:image/svg+xml;base64,AAAA">'))
    expect(out).not.toContain('data:image/svg+xml')
  })

  it('keeps ordinary data:image URLs and plain content intact', () => {
    const out = html(sanitizeHTMLToDom('<img src="data:image/png;base64,AAAA"><b>bold</b>'))
    expect(out).toContain('data:image/png')
    expect(out).toContain('<b>bold</b>')
  })
})
