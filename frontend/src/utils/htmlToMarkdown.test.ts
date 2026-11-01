import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from './htmlToMarkdown'

describe('htmlToMarkdown', () => {
  it('converts headings', () => {
    expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title')
    expect(htmlToMarkdown('<h3>Sub</h3>')).toBe('### Sub')
  })

  it('converts bold and italic', () => {
    expect(htmlToMarkdown('<strong>bold</strong>')).toBe('**bold**')
    expect(htmlToMarkdown('<b>bold</b>')).toBe('**bold**')
    expect(htmlToMarkdown('<em>it</em>')).toBe('_it_')
    expect(htmlToMarkdown('<i>it</i>')).toBe('_it_')
  })

  it('converts strikethrough and inline code', () => {
    expect(htmlToMarkdown('<del>gone</del>')).toBe('~~gone~~')
    expect(htmlToMarkdown('<code>x</code>')).toBe('`x`')
  })

  it('converts links keeping href', () => {
    expect(htmlToMarkdown('<a href="https://example.com">site</a>')).toBe('[site](https://example.com)')
  })

  it('converts images', () => {
    expect(htmlToMarkdown('<img src="a.png" alt="pic">')).toBe('![pic](a.png)')
  })

  it('converts paragraphs to blank-line-separated blocks', () => {
    expect(htmlToMarkdown('<p>one</p><p>two</p>')).toBe('one\n\ntwo')
  })

  it('converts unordered and ordered lists', () => {
    expect(htmlToMarkdown('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b')
    expect(htmlToMarkdown('<ol><li>a</li><li>b</li></ol>')).toBe('1. a\n2. b')
  })

  it('converts a blockquote', () => {
    expect(htmlToMarkdown('<blockquote>quoted</blockquote>')).toBe('> quoted')
  })

  it('converts a code block', () => {
    expect(htmlToMarkdown('<pre>const x = 1</pre>')).toBe('```\nconst x = 1\n```')
  })

  it('converts <br> to a newline', () => {
    expect(htmlToMarkdown('line<br>break')).toBe('line\nbreak')
  })

  it('escapes Markdown-active characters in plain text', () => {
    expect(htmlToMarkdown('<p>a * b _ c</p>')).toBe('a \\* b \\_ c')
  })

  it('collapses excess whitespace from pretty-printed source', () => {
    expect(htmlToMarkdown('<p>  lots\n   of   space  </p>')).toBe('lots of space')
  })

  it('returns plain text for structureless fragments', () => {
    expect(htmlToMarkdown('just text')).toBe('just text')
  })

  it('combines nested inline inside a paragraph', () => {
    expect(htmlToMarkdown('<p>a <strong>b</strong> c</p>')).toBe('a **b** c')
  })
})
