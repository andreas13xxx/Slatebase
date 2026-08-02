/**
 * MarkdownRenderer — Obsidian-compatible static markdown rendering.
 *
 * Plugins use `MarkdownRenderer.render(app, markdown, el, sourcePath, component)` or
 * `MarkdownRenderer.renderMarkdown(markdown, el, sourcePath, component)` to render
 * markdown content into a DOM element within custom views (Kanban, Dataview, etc.).
 *
 * Uses a lightweight markdown-to-HTML conversion that handles common markdown syntax.
 * Does NOT use the full remark/unified pipeline (to avoid heavy dependency coupling
 * between the plugin shim layer and the main app renderer).
 *
 * Supported syntax:
 * - Headings (# to ######)
 * - Bold (**text**), Italic (*text* / _text_), Strikethrough (~~text~~)
 * - Inline code (`code`), Code blocks (```lang\n...\n```)
 * - Unordered lists (- / * / +), Ordered lists (1.)
 * - Blockquotes (>)
 * - Links [text](url), Images ![alt](url)
 * - Wikilinks [[target]] / [[target|display]]
 * - Horizontal rules (---, ***, ___)
 * - Line breaks (two trailing spaces or explicit <br>)
 *
 * @module markdown-renderer
 */

/**
 * MarkdownRenderer — Static class matching Obsidian's API.
 *
 * Both `render()` and `renderMarkdown()` are provided for compatibility.
 * In Obsidian, `render()` was added later and `renderMarkdown()` is the older API.
 */
export class MarkdownRenderer {
  /**
   * Render markdown content into a DOM element.
   *
   * @param _app - App instance (unused, for API compat)
   * @param markdown - The markdown string to render
   * @param el - The target DOM element to render into
   * @param sourcePath - The source file path (for relative link resolution)
   * @param _component - Component reference for lifecycle management (unused)
   */
  static async render(
    _app: unknown,
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    _component?: unknown,
  ): Promise<void> {
    return MarkdownRenderer.renderMarkdown(markdown, el, sourcePath, _component)
  }

  /**
   * Render markdown content into a DOM element (legacy API).
   *
   * @param markdown - The markdown string to render
   * @param el - The target DOM element to render into
   * @param _sourcePath - The source file path (for relative link resolution, currently unused)
   * @param _component - Component reference for lifecycle management (unused)
   */
  static async renderMarkdown(
    markdown: string,
    el: HTMLElement,
    _sourcePath: string,
    _component?: unknown,
  ): Promise<void> {
    const html = markdownToHtml(markdown)
    el.innerHTML = html
    el.classList.add('markdown-rendered')
  }
}

// ─── Lightweight Markdown-to-HTML Converter ────────────────────────────────────

/**
 * Convert a markdown string to HTML.
 * Handles block-level and inline-level syntax.
 */
function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n')
  const blocks: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // Code block (fenced)
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]!))
        i++
      }
      i++ // Skip closing ```
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : ''
      blocks.push(`<pre><code${langAttr}>${codeLines.join('\n')}</code></pre>`)
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push('<hr>')
      i++
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1]!.length
      const text = renderInline(headingMatch[2]!)
      blocks.push(`<h${level}>${text}</h${level}>`)
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && (lines[i]!.startsWith('>') || (lines[i]!.trim() !== '' && quoteLines.length > 0 && !lines[i]!.startsWith('#')))) {
        const ql = lines[i]!
        quoteLines.push(ql.startsWith('> ') ? ql.slice(2) : ql.startsWith('>') ? ql.slice(1) : ql)
        i++
      }
      const innerHtml = markdownToHtml(quoteLines.join('\n'))
      blocks.push(`<blockquote>${innerHtml}</blockquote>`)
      continue
    }

    // Unordered list
    if (/^[\s]*[-*+]\s+/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length && /^[\s]*[-*+]\s+/.test(lines[i]!)) {
        const itemText = lines[i]!.replace(/^[\s]*[-*+]\s+/, '')
        listItems.push(`<li>${renderInline(itemText)}</li>`)
        i++
      }
      blocks.push(`<ul>${listItems.join('')}</ul>`)
      continue
    }

    // Ordered list
    if (/^[\s]*\d+\.\s+/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length && /^[\s]*\d+\.\s+/.test(lines[i]!)) {
        const itemText = lines[i]!.replace(/^[\s]*\d+\.\s+/, '')
        listItems.push(`<li>${renderInline(itemText)}</li>`)
        i++
      }
      blocks.push(`<ol>${listItems.join('')}</ol>`)
      continue
    }

    // Empty line
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph (collect consecutive non-empty lines)
    const paraLines: string[] = []
    while (i < lines.length && lines[i]!.trim() !== '' &&
           !lines[i]!.startsWith('#') && !lines[i]!.startsWith('```') &&
           !lines[i]!.startsWith('>') && !/^[\s]*[-*+]\s+/.test(lines[i]!) &&
           !/^[\s]*\d+\.\s+/.test(lines[i]!) && !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]!)) {
      paraLines.push(lines[i]!)
      i++
    }
    if (paraLines.length > 0) {
      // Join with <br> for lines ending with two spaces, otherwise space
      const html = paraLines.map((l, idx) => {
        const rendered = renderInline(l)
        if (idx < paraLines.length - 1 && l.endsWith('  ')) {
          return rendered.slice(0, -2) + '<br>'
        }
        return rendered
      }).join('\n')
      blocks.push(`<p>${html}</p>`)
    }
  }

  return blocks.join('\n')
}

/**
 * Render inline markdown elements to HTML.
 */
function renderInline(text: string): string {
  let result = escapeHtml(text)

  // Inline code (must be first to prevent other rules from interfering)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Images ![alt](url)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')

  // Links [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Wikilinks [[target|display]] and [[target]]
  result = result.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '<a class="internal-link" data-href="$1">$2</a>')
  result = result.replace(/\[\[([^\]]+)\]\]/g, '<a class="internal-link" data-href="$1">$1</a>')

  // Bold **text** or __text__
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>')

  // Italic *text* or _text_
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  result = result.replace(/(?<!\w)_([^_]+)_(?!\w)/g, '<em>$1</em>')

  // Strikethrough ~~text~~
  result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  // Tags #tag (after other processing to avoid conflicts)
  result = result.replace(/(^|\s)#([a-zA-Z][\w/-]*)/g, '$1<a class="tag" href="#$2">#$2</a>')

  return result
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
