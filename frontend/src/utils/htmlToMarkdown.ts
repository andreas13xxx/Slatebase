/**
 * htmlToMarkdown — a small, dependency-free HTML → Markdown converter for the clipboard.
 *
 * Backs app.json `autoConvertHtml`: when on, pasting rich text (the clipboard's `text/html`) inserts
 * Markdown instead of the raw text. It is deliberately a pragmatic subset of the common inline and
 * block tags a word processor, browser or note app produces — not a full HTML-to-Markdown engine
 * (the frontend ships no `turndown`). Anything it does not know degrades to the element's text.
 *
 * @module utils/htmlToMarkdown
 */

/** Inline tags that wrap their text content in Markdown emphasis. */
const WRAP: Record<string, string> = {
  STRONG: '**',
  B: '**',
  EM: '_',
  I: '_',
  DEL: '~~',
  S: '~~',
  STRIKE: '~~',
  CODE: '`',
}

/** Escapes the Markdown-active characters in plain text so a literal `*` or `_` is not read as syntax. */
function escapeText(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1')
}

/** Renders the children of a node, joining their Markdown. */
function renderChildren(node: Node): string {
  let out = ''
  node.childNodes.forEach((child) => {
    out += renderNode(child)
  })
  return out
}

/** Renders one DOM node to Markdown. */
function renderNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // Collapse runs of whitespace (including the newlines of a pretty-printed source) to one space
    return escapeText((node.textContent ?? '').replace(/\s+/g, ' '))
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName
  const inner = renderChildren(el)

  if (tag === 'BR') return '\n'
  if (WRAP[tag]) {
    const marker = WRAP[tag]
    const trimmed = inner.trim()
    return trimmed ? `${marker}${trimmed}${marker}` : ''
  }
  if (tag === 'A') {
    const href = el.getAttribute('href')
    const text = inner.trim() || href || ''
    return href ? `[${text}](${href})` : text
  }
  if (tag === 'IMG') {
    const src = el.getAttribute('src') ?? ''
    const alt = el.getAttribute('alt') ?? ''
    return src ? `![${alt}](${src})` : ''
  }
  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    return `\n\n${'#'.repeat(level)} ${inner.trim()}\n\n`
  }
  if (tag === 'P' || tag === 'DIV') {
    const trimmed = inner.trim()
    return trimmed ? `\n\n${trimmed}\n\n` : ''
  }
  if (tag === 'BLOCKQUOTE') {
    const lines = inner.trim().split('\n').map((line) => `> ${line}`.trimEnd())
    return `\n\n${lines.join('\n')}\n\n`
  }
  if (tag === 'PRE') {
    return `\n\n\`\`\`\n${(el.textContent ?? '').replace(/\n$/, '')}\n\`\`\`\n\n`
  }
  if (tag === 'UL' || tag === 'OL') {
    return `\n${renderList(el, tag === 'OL')}\n`
  }
  if (tag === 'HR') return '\n\n---\n\n'

  return inner
}

/** Renders a `<ul>`/`<ol>` with its `<li>` children as a Markdown list. */
function renderList(list: HTMLElement, ordered: boolean): string {
  let out = ''
  let index = 1
  list.childNodes.forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === 'LI') {
      const marker = ordered ? `${index}.` : '-'
      index += 1
      out += `${marker} ${renderChildren(child).trim()}\n`
    }
  })
  return out
}

/** Collapses the 3+ blank lines block rendering can produce down to a single blank line. */
function normalizeBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Converts an HTML fragment (the clipboard's `text/html`) to Markdown. Returns the plain text when the
 * fragment has no structure worth converting, so a copy of plain text pasted from a rich source is
 * unchanged.
 */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return normalizeBlankLines(renderChildren(doc.body))
}
