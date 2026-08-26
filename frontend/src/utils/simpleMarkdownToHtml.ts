/**
 * Simple Markdown → HTML conversion for rendering plain external Markdown
 * (plugin READMEs, CHANGELOG.md, ...) without pulling in the full
 * wikilink/embed/tag-aware pipeline ViewMode.tsx uses for vault notes.
 * Handles headings, bold, italic, code blocks, inline code, links, images,
 * lists, blockquotes, and horizontal rules.
 *
 * Originally lived only in PluginDetailPanel.tsx (README rendering); extracted
 * here so ReleaseNotesModal.tsx can reuse it for CHANGELOG.md without
 * duplicating the sanitization logic.
 *
 * Content may come from an untrusted source (arbitrary GitHub repos for
 * READMEs), so link/image URLs and alt text are sanitized before
 * interpolation — see sanitizeUrl() and escapeAttributeQuotes() below.
 */

/**
 * @param markdown - The raw Markdown source to convert.
 * @param repo - Optional `owner/name` GitHub repo used to resolve relative
 *   image URLs against that repo's raw content host. Omit for content with no
 *   repo-relative references (e.g. a bundled CHANGELOG.md).
 */
export function markdownToHtml(markdown: string, repo?: string): string {
  const rawBase = repo ? `https://raw.githubusercontent.com/${repo}/HEAD/` : null

  let html = markdown
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks (fenced)
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const content = match.replace(/```\w*\n?/, '').replace(/\n?```$/, '')
    return `<pre><code>${content}</code></pre>`
  })

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr>')

  // Images (before links since ![...] includes [...)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const resolvedSrc = rawBase ? resolveUrl(src as string, rawBase) : (src as string)
    const safeSrc = escapeAttributeQuotes(sanitizeUrl(resolvedSrc))
    const safeAlt = escapeAttributeQuotes(alt as string)
    return `<img src="${safeSrc}" alt="${safeAlt}" />`
  })

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
    const safeHref = escapeAttributeQuotes(sanitizeUrl(href as string))
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${text as string}</a>`
  })

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/_(.+?)_/g, '<em>$1</em>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>')

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Paragraphs (lines not already wrapped in a block element)
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>')

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '')

  return html
}

/**
 * Resolves a potentially relative URL against a base URL.
 */
function resolveUrl(src: string, base: string): string {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
    return src
  }
  return base + src.replace(/^\.\//, '')
}

/** URL schemes allowed in href/src attributes rendered from untrusted content. */
const SAFE_URL_SCHEME = /^(?:https?|mailto):/i

/**
 * Sanitizes a URL for use in an href/src attribute rendered from potentially
 * untrusted Markdown. Only http(s)/mailto and scheme-less (relative) URLs are
 * allowed; anything else — javascript:, data:, vbscript:, etc. — is replaced
 * with a harmless fallback ('#').
 */
function sanitizeUrl(url: string): string {
  // Strip ASCII whitespace/control characters (code points 0-32) one by one.
  // Browsers ignore them when resolving a URL scheme (the classic
  // "java<TAB>script:" filter-bypass trick) — without this, such a payload
  // would fail the scheme check below and be waved through as "relative".
  let stripped = ''
  for (const ch of url) {
    if (ch.charCodeAt(0) > 32) stripped += ch
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(stripped)
  if (hasScheme && !SAFE_URL_SCHEME.test(stripped)) {
    return '#'
  }
  return stripped
}

/**
 * Escapes quote characters for safe interpolation inside a double-quoted
 * HTML attribute. `&`/`<`/`>` are already escaped by the entity pass at the
 * top of markdownToHtml, so only quotes need handling here.
 */
function escapeAttributeQuotes(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
