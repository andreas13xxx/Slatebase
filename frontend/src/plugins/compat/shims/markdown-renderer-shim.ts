/**
 * MarkdownRendererShim — Obsidian-compatible MarkdownRenderer.render() emulation.
 *
 * Provides the static `render()` method that plugins use to convert Markdown strings
 * to rendered HTML inside a given container element.
 *
 * Uses our existing unified/remark pipeline to parse Markdown into MDAST,
 * then serializes the MDAST to an HTML string.
 *
 * Obsidian API signature:
 *   MarkdownRenderer.render(app, markdown, el, sourcePath, component): Promise<void>
 *
 * We ignore `app` and `component` parameters (lifecycle management is not needed
 * for the simple render case). `sourcePath` is used for resolving relative links.
 *
 * @module markdown-renderer-shim
 */

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import type { Root, RootContent, PhrasingContent, AlignType } from 'mdast'

// ─── MDAST → HTML Serializer ───────────────────────────────────────────────────

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

/**
 * Serialize an array of MDAST phrasing content nodes to an HTML string.
 */
function serializeInline(nodes: PhrasingContent[]): string {
  return nodes.map(serializeInlineNode).join('')
}

/**
 * Serialize a single inline (phrasing) MDAST node to HTML.
 */
function serializeInlineNode(node: PhrasingContent): string {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value)
    case 'strong':
      return `<strong>${serializeInline(node.children)}</strong>`
    case 'emphasis':
      return `<em>${serializeInline(node.children)}</em>`
    case 'delete':
      return `<del>${serializeInline(node.children)}</del>`
    case 'inlineCode':
      return `<code>${escapeHtml(node.value)}</code>`
    case 'link':
      return `<a href="${escapeHtml(node.url)}"${node.title ? ` title="${escapeHtml(node.title)}"` : ''}>${serializeInline(node.children)}</a>`
    case 'image':
      return `<img src="${escapeHtml(node.url)}" alt="${escapeHtml(node.alt ?? '')}"${node.title ? ` title="${escapeHtml(node.title)}"` : ''} />`
    case 'break':
      return '<br />'
    case 'html':
      return node.value
    default: {
      // For unknown inline nodes (wikilinks, tags, embeds), try to extract text
      const unknownNode = node as unknown as { value?: string; children?: PhrasingContent[] }
      if (unknownNode.children) {
        return serializeInline(unknownNode.children)
      }
      if (unknownNode.value) {
        return escapeHtml(unknownNode.value)
      }
      return ''
    }
  }
}

/**
 * Serialize a block-level MDAST node to an HTML string.
 */
function serializeBlock(node: RootContent): string {
  switch (node.type) {
    case 'paragraph':
      return `<p>${serializeInline(node.children)}</p>`

    case 'heading':
      return `<h${node.depth}>${serializeInline(node.children)}</h${node.depth}>`

    case 'blockquote':
      return `<blockquote>${serializeBlocks(node.children)}</blockquote>`

    case 'code':
      return `<pre><code${node.lang ? ` class="language-${escapeHtml(node.lang)}"` : ''}>${escapeHtml(node.value)}</code></pre>`

    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul'
      const startAttr = node.ordered && node.start != null && node.start !== 1
        ? ` start="${node.start}"`
        : ''
      const items = node.children.map((item) => {
        const checkbox = item.checked != null
          ? `<input type="checkbox" disabled${item.checked ? ' checked' : ''} /> `
          : ''
        const content = item.children.map(serializeBlock).join('')
        return `<li>${checkbox}${content}</li>`
      }).join('')
      return `<${tag}${startAttr}>${items}</${tag}>`
    }

    case 'thematicBreak':
      return '<hr />'

    case 'html':
      return node.value

    case 'table': {
      const alignments: (AlignType | null)[] = node.align ?? []
      const rows = node.children
      let html = '<table>'

      if (rows.length > 0) {
        const headerRow = rows[0]!
        html += '<thead><tr>'
        headerRow.children.forEach((cell, i) => {
          const align = alignments[i]
          const alignAttr = align ? ` style="text-align: ${align}"` : ''
          html += `<th${alignAttr}>${serializeInline(cell.children)}</th>`
        })
        html += '</tr></thead>'

        if (rows.length > 1) {
          html += '<tbody>'
          for (let r = 1; r < rows.length; r++) {
            const row = rows[r]!
            html += '<tr>'
            row.children.forEach((cell, i) => {
              const align = alignments[i]
              const alignAttr = align ? ` style="text-align: ${align}"` : ''
              html += `<td${alignAttr}>${serializeInline(cell.children)}</td>`
            })
            html += '</tr>'
          }
          html += '</tbody>'
        }
      }

      html += '</table>'
      return html
    }

    case 'yaml':
      // Frontmatter — don't render
      return ''

    default: {
      // For unknown block nodes, try to serialize children
      const unknownNode = node as unknown as { children?: RootContent[]; value?: string }
      if (unknownNode.children) {
        return serializeBlocks(unknownNode.children)
      }
      if (unknownNode.value) {
        return `<p>${escapeHtml(unknownNode.value)}</p>`
      }
      return ''
    }
  }
}

/**
 * Serialize an array of block-level MDAST nodes.
 */
function serializeBlocks(nodes: RootContent[]): string {
  return nodes.map(serializeBlock).join('\n')
}

/**
 * Parse markdown to MDAST and serialize to HTML string.
 */
function markdownToHtml(markdown: string): string {
  try {
    const tree = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ['yaml'])
      .use(remarkGfm)
      .parse(markdown)

    return serializeBlocks((tree as Root).children)
  } catch (err) {
    console.error('[MarkdownRenderer] Failed to parse markdown:', err)
    return `<p>${escapeHtml(markdown)}</p>`
  }
}

// ─── MarkdownRenderer Public API ───────────────────────────────────────────────

/**
 * MarkdownRenderer — Obsidian-compatible static class for rendering Markdown.
 *
 * Provides:
 * - `render(app, markdown, el, sourcePath, component)` — Async render Markdown into an element
 * - `renderMarkdown(markdown, el, sourcePath, component)` — Deprecated alias
 */
export class MarkdownRendererShim {
  /**
   * Render Markdown string into an HTML element.
   *
   * @param _app - App reference (ignored in Slatebase)
   * @param markdown - The Markdown source string to render
   * @param el - The target HTML element to render into
   * @param _sourcePath - Source file path for resolving relative links (reserved for future use)
   * @param _component - Parent component for lifecycle (ignored in Slatebase)
   */
  static async render(
    _app: unknown,
    markdown: string,
    el: HTMLElement,
    _sourcePath: string,
    _component: unknown,
  ): Promise<void> {
    const html = markdownToHtml(markdown)
    el.innerHTML = html
  }

  /**
   * Deprecated alias for render(). Obsidian 0.x API.
   */
  static async renderMarkdown(
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    component: unknown,
  ): Promise<void> {
    return MarkdownRendererShim.render(null, markdown, el, sourcePath, component)
  }
}

/**
 * MarkdownRenderChild — Base class for rendered content lifecycle management.
 * Plugins extend this to track when their rendered content is removed from the DOM.
 */
export class MarkdownRenderChildShim {
  containerEl: HTMLElement

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl
  }

  load(): void {}
  unload(): void {}
  onload(): void {}
  onunload(): void {}
}

/**
 * Register MarkdownRenderer and MarkdownRenderChild on window.obsidian.
 */
export function registerMarkdownRendererGlobal(): void {
  const obsidian = (window as unknown as { obsidian?: Record<string, unknown> }).obsidian
  if (obsidian) {
    obsidian.MarkdownRenderer = MarkdownRendererShim
    // Also expose as the class itself (plugins do `MarkdownRenderer.render()`)
    if (!obsidian.MarkdownRenderChild) {
      obsidian.MarkdownRenderChild = MarkdownRenderChildShim
    }
  }
}
