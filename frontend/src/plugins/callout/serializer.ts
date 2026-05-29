/**
 * Callout serializer (toMarkdown extension).
 *
 * Serializes CalloutNode back to Obsidian callout blockquote syntax:
 * - `> [!type] Title` (non-foldable)
 * - `> [!type]- Title` (foldable, collapsed by default)
 * - `> [!type]+ Title` (foldable, open by default)
 * - Body lines prefixed with `> `
 */
import type { Options as ToMarkdownExtension } from 'mdast-util-to-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import type { Root } from 'mdast'
import type { CalloutNode } from '../types'

/**
 * Creates a toMarkdown extension that serializes CalloutNode
 * back to Obsidian callout blockquote markdown syntax.
 */
export function calloutToMarkdown(): ToMarkdownExtension {
  return {
    handlers: {
      callout(node: CalloutNode): string {
        // Build the header line: > [!type] Title or > [!type]+/- Title
        let foldMarker = ''
        if (node.foldable) {
          foldMarker = node.defaultOpen ? '+' : '-'
        }

        const headerLine = `> [!${node.calloutType}]${foldMarker} ${node.title}`

        // If there's no body, return just the header
        if (!node.body || node.body.length === 0) {
          return headerLine
        }

        // Serialize body nodes to markdown by wrapping them in a Root node
        const bodyTree: Root = {
          type: 'root',
          children: node.body,
        }

        const bodyMarkdown = toMarkdown(bodyTree)

        // Prefix each line of the body with `> `
        // Remove trailing newline from toMarkdown output before splitting
        const trimmedBody = bodyMarkdown.replace(/\n$/, '')
        const prefixedLines = trimmedBody
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')

        return `${headerLine}\n${prefixedLines}`
      },
    },
  }
}
