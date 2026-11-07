import { describe, it, expect, afterEach } from 'vitest'
import { MarkdownRendererShim } from './markdown-renderer-shim'
import { MarkdownRenderer } from '../markdown-renderer'

/** Vault content is attacker-controlled: the shims must not emit script-capable HTML. */
describe('MarkdownRenderer shims — sanitizing', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  type Renderer = (md: string) => HTMLElement

  const renderShim: Renderer = (md) => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    void MarkdownRendererShim.render(null, md, el, 'a.md', null)
    return el
  }
  const renderLight: Renderer = (md) => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    void MarkdownRenderer.renderMarkdown(md, el, 'a.md', null)
    return el
  }

  describe.each([
    ['shim', renderShim],
    ['lightweight renderer', renderLight],
  ])('%s', (_name, render) => {
    const badSchemes = [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ]

    it.each(badSchemes)('neutralizes link href %j', (url) => {
      const a = render(`[x](${url.replace(/\n/g, '%0A')})`).querySelector('a')
      const href = (a?.getAttribute('href') ?? '').replace(/\s/g, '').toLowerCase()
      expect(href).not.toMatch(/^(javascript|vbscript|data):/)
    })

    it.each(badSchemes)('neutralizes image src %j', (url) => {
      const img = render(`![x](${url.replace(/\n/g, '%0A')})`).querySelector('img')
      const src = (img?.getAttribute('src') ?? '').replace(/\s/g, '').toLowerCase()
      expect(src).not.toMatch(/^(javascript|vbscript|data):/)
    })

    it('strips raw event handlers and scripts', () => {
      const el = render('hi <img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\n<b onclick="x()">b</b>')
      expect(el.querySelector('script')).toBeNull()
      // The lightweight renderer escapes raw HTML to text; either way no element may carry a handler.
      expect(el.querySelector('[onerror],[onclick]')).toBeNull()
    })

    it('keeps https, mailto and relative links', () => {
      const el = render('[a](https://example.com) [b](mailto:x@y.z) [c](notes/x.md)')
      const hrefs = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'))
      expect(hrefs).toEqual(['https://example.com', 'mailto:x@y.z', 'notes/x.md'])
    })

  })

  it('shim keeps benign raw HTML', () => {
    const el = renderShim('a <b>bold</b><br>x')
    expect(el.querySelector('b')?.textContent).toBe('bold')
    expect(el.querySelector('br')).not.toBeNull()
  })

  it('shim keeps internal links and tables intact', () => {
    const el = renderShim('[[Note|Shown]]\n\n| a | b |\n|:-|-:|\n| 1 | 2 |')
    const link = el.querySelector('a.internal-link')
    expect(link?.getAttribute('data-href')).toBe('Note')
    expect(link?.textContent).toBe('Shown')
    expect(el.querySelectorAll('td')).toHaveLength(2)
    expect(el.querySelector('th')?.getAttribute('style')).toContain('text-align')
  })
})
