/**
 * MarkdownRendererShim — Obsidian-compatible MarkdownRenderer.render() emulation.
 *
 * Provides the static `render()` method that plugins use to convert Markdown strings
 * to rendered HTML inside a given container element.
 *
 * Uses our existing unified/remark pipeline to parse Markdown into MDAST,
 * then serializes the MDAST to an HTML string. Obsidian wikilinks are part of
 * that pipeline (remarkWikilink) and become clickable `a.internal-link`
 * anchors — Dataview and friends emit their file references as `[[…]]`, so
 * without it every link in a query result would show up as raw text.
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
import { remarkWikilink } from '../../wikilink/plugin'
import type { WikilinkNode } from '../../types'
import { getActiveWorkspaceShim } from '../active-workspace-shim'
import { requestHoverPreview, dismissHoverPreview } from '../hover-link-bus'

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
 * Serialize a wikilink node to an Obsidian-style internal link.
 *
 * Plugins hand their output to us as markdown — Dataview renders every file
 * reference as `[[path/to/note.md|Display]]` — so without this the whole link
 * ends up as literal `[[…]]` text in the rendered table.
 *
 * The markup mirrors Obsidian's (`a.internal-link` carrying `data-href`),
 * which is what plugin stylesheets target and what
 * {@link attachInternalLinkBehaviour} listens for.
 */
function serializeWikilink(node: WikilinkNode): string {
  const target = node.target ?? ''
  const subpath = node.blockRef ? `#^${node.blockRef}` : node.heading ? `#${node.heading}` : ''
  const href = `${target}${subpath}`
  const text = node.display || href
  return `<a class="internal-link" href="#" data-href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
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
  // `wikilink` is not part of mdast's phrasing union (remarkWikilink adds it),
  // so it has to be matched before the switch narrows on the known types —
  // otherwise it falls into `default:` and renders as literal `[[…]]` text.
  if ((node as { type: string }).type === 'wikilink') {
    return serializeWikilink(node as unknown as WikilinkNode)
  }

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
      // For unknown inline nodes (tags, embeds), try to extract text
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
      .use(remarkWikilink)
      .parse(markdown)

    return serializeBlocks((tree as Root).children)
  } catch (err) {
    console.error('[MarkdownRenderer] Failed to parse markdown:', err)
    return `<p>${escapeHtml(markdown)}</p>`
  }
}

// ─── Internal Link Behaviour ───────────────────────────────────────────────────

/** Containers that already carry the delegated listeners. */
const linkBehaviourBound = new WeakSet<HTMLElement>()

/** The `a.internal-link` under an event target, if there is one. */
function internalLinkUnder(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const link = target.closest('a.internal-link[data-href]')
  return link instanceof HTMLElement ? link : null
}

/**
 * The file part of a link's `data-href`. The subpath (`#heading` / `#^block`)
 * stays on the element for context, but neither the link resolver nor the
 * preview popover understands one.
 */
function linkFileTarget(link: HTMLElement): string {
  const href = link.dataset['href'] ?? ''
  return href.split('#')[0] ?? ''
}

/**
 * Give the `a.internal-link` anchors from {@link serializeWikilink} the same
 * behaviour they have in a note Slatebase renders itself: click to open, hover
 * for a preview.
 *
 * Delegated on the container the plugin rendered into (rather than bound per
 * anchor) so it keeps working when the plugin re-renders its own output, and
 * registered at most once per element so repeated render() calls for the same
 * container don't stack listeners.
 */
function attachInternalLinkBehaviour(el: HTMLElement, sourcePath: string): void {
  if (linkBehaviourBound.has(el)) return
  linkBehaviourBound.add(el)

  el.addEventListener('click', (event) => {
    const link = internalLinkUnder(event.target)
    if (!link) return

    const target = linkFileTarget(link)
    if (!target) return

    event.preventDefault()
    // Don't let the click reach the editor underneath: in Live Preview that
    // would put the cursor inside the code block and swap the rendered widget
    // back to its source.
    event.stopPropagation()

    void getActiveWorkspaceShim()?.openLinkText(target, sourcePath)
  })

  // Hover previews, delegated the same way ViewMode does it for Slatebase's
  // own links. The popover lives at the app root, so this works in Live
  // Preview and in Reading View alike.
  el.addEventListener('mouseover', (event) => {
    const link = internalLinkUnder(event.target)
    if (!link) return

    const target = linkFileTarget(link)
    if (!target) return

    requestHoverPreview({ linkPath: target, targetEl: link, source: 'internal-link', sourcePath })
  })

  el.addEventListener('mouseout', (event) => {
    if (internalLinkUnder(event.target)) dismissHoverPreview()
  })
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
   * @param sourcePath - Source file path, passed on when an internal link is followed or previewed
   * @param _component - Parent component for lifecycle (ignored in Slatebase)
   */
  static async render(
    _app: unknown,
    markdown: string,
    el: HTMLElement,
    sourcePath: string,
    _component: unknown,
  ): Promise<void> {
    const html = markdownToHtml(markdown)
    el.innerHTML = html
    if (html.includes('class="internal-link"')) {
      attachInternalLinkBehaviour(el, sourcePath ?? '')
    }
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
 * Register MarkdownRenderer and MarkdownRenderChild on window.obsidian.
 *
 * This is called AFTER installObsidianGlobals(), which registers an instanziable
 * MarkdownRenderer class (extends MarkdownRenderChild). We only need to upgrade
 * the static render methods to use the full remark pipeline — NOT replace the class,
 * which would break the instanceof chain (MarkdownPreviewView extends MarkdownRenderer).
 */
export function registerMarkdownRendererGlobal(): void {
  const obsidian = (window as unknown as { obsidian?: Record<string, unknown> }).obsidian
  if (obsidian) {
    const existingRenderer = obsidian.MarkdownRenderer as { render?: unknown; renderMarkdown?: unknown } | undefined
    if (existingRenderer && typeof existingRenderer === 'function') {
      // Patch static methods onto the existing instanziable class
      (existingRenderer as unknown as { render: unknown }).render = MarkdownRendererShim.render;
      (existingRenderer as unknown as { renderMarkdown: unknown }).renderMarkdown = MarkdownRendererShim.renderMarkdown
    } else {
      // Fallback: no existing class — use the shim directly
      obsidian.MarkdownRenderer = MarkdownRendererShim
    }
  }
}
