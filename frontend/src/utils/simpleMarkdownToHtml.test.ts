import { describe, it, expect } from 'vitest'
import { markdownToHtml } from './simpleMarkdownToHtml'

describe('markdownToHtml', () => {
  it('renders headings', () => {
    expect(markdownToHtml('# Title\n## Subtitle')).toBe('<h1>Title</h1>\n<h2>Subtitle</h2>')
  })

  it('renders bold and italic', () => {
    expect(markdownToHtml('**bold** and *italic*')).toContain('<strong>bold</strong>')
    expect(markdownToHtml('**bold** and *italic*')).toContain('<em>italic</em>')
  })

  it('renders inline code and fenced code blocks', () => {
    expect(markdownToHtml('`inline`')).toContain('<code>inline</code>')
    expect(markdownToHtml('```\nconst x = 1\n```')).toContain('<pre><code>const x = 1</code></pre>')
  })

  it('renders links with target=_blank and rel=noopener', () => {
    const html = markdownToHtml('[text](https://example.com)')
    expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">text</a>')
  })

  it('sanitizes javascript: URLs in links to a harmless fallback', () => {
    const html = markdownToHtml('[click](javascript:alert(1))')
    expect(html).toContain('href="#"')
    expect(html).not.toContain('javascript:')
  })

  it('resolves relative image URLs against the given repo when provided', () => {
    const html = markdownToHtml('![alt](./img.png)', 'owner/repo')
    expect(html).toContain('src="https://raw.githubusercontent.com/owner/repo/HEAD/img.png"')
  })

  it('leaves relative image URLs untouched when no repo is given', () => {
    const html = markdownToHtml('![alt](./img.png)')
    expect(html).toContain('src="./img.png"')
  })

  it('escapes HTML entities in plain text', () => {
    expect(markdownToHtml('a < b & c > d')).toContain('a &lt; b &amp; c &gt; d')
  })

  it('renders unordered lists', () => {
    const html = markdownToHtml('- one\n- two')
    expect(html).toContain('<ul><li>one</li>\n<li>two</li></ul>')
  })
})
