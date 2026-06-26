/**
 * toMarkdown extension for block markers.
 *
 * When serializing paragraph, listItem, or heading nodes that have a `blockId` property,
 * this extension appends ` ^block-id` at the end of the serialized content.
 *
 * This ensures round-trip fidelity: parse → serialize restores the marker.
 */
import type { Options as ToMarkdownExtension } from 'mdast-util-to-markdown'
import type { Paragraph, Heading, ListItem } from 'mdast'

type NodeWithBlockId = (Paragraph | Heading | ListItem) & { blockId?: string }

/**
 * Creates a toMarkdown extension that restores block markers during serialization.
 *
 * Uses the `handlers` approach to override default paragraph and heading serialization
 * when a `blockId` property is present.
 */
export function blockRefToMarkdown(): ToMarkdownExtension {
  return {
    handlers: {
      paragraph(node, _parent, state, info) {
        const blockNode = node as unknown as NodeWithBlockId
        // Use the default phrasing handler to serialize children
        const result = state.containerPhrasing(node, {
          before: info.before,
          after: info.after,
          ...info,
        })
        if (blockNode.blockId) {
          return result + ` ^${blockNode.blockId}`
        }
        return result
      },
      heading(node, _parent, state, info) {
        const blockNode = node as unknown as NodeWithBlockId
        const headingNode = node as Heading
        const prefix = '#'.repeat(headingNode.depth) + ' '
        const result = state.containerPhrasing(node, {
          before: '# ',
          after: '\n',
          ...info,
        })
        const fullResult = prefix + result
        if (blockNode.blockId) {
          return fullResult + ` ^${blockNode.blockId}`
        }
        return fullResult
      },
    },
  }
}
