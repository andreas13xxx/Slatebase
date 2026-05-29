/**
 * mdast-util extension for Obsidian embed syntax.
 *
 * Provides fromMarkdown and toMarkdown handlers that convert between
 * micromark tokens and EmbedNode MDAST nodes.
 *
 * fromMarkdown: Converts embed tokens into EmbedNode with target, heading, embedType.
 * toMarkdown: Serializes EmbedNode back to `![[target]]` or `![[target#heading]]`.
 */
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown'
import type { Options as ToMarkdownExtension } from 'mdast-util-to-markdown'
import type { EmbedNode } from '../types'
import { detectEmbedType } from './syntax'

/**
 * Creates a fromMarkdown extension that converts embed tokens to EmbedNode.
 *
 * Handles the following token types from the embed micromark extension:
 * - `embed` (wrapper token)
 * - `embedMarker` (the `![[` and `]]` delimiters)
 * - `embedTarget` (the target text)
 * - `embedHeadingMarker` (the `#` separator)
 * - `embedHeading` (the heading text after `#`)
 */
export function embedFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      embed(token) {
        const node: EmbedNode = {
          type: 'embed',
          target: '',
          heading: null,
          embedType: 'note',
          value: '',
        }
        this.enter(node, token)
      },
    },
    exit: {
      embedTarget(token) {
        const target = this.sliceSerialize(token)
        const current = this.stack[this.stack.length - 1]
        if (current && current.type === 'embed') {
          const node = current as unknown as EmbedNode
          node.target = target
          node.embedType = detectEmbedType(target)
        }
      },
      embedHeading(token) {
        const heading = this.sliceSerialize(token)
        const current = this.stack[this.stack.length - 1]
        if (current && current.type === 'embed') {
          const node = current as unknown as EmbedNode
          node.heading = heading
        }
      },
      embed(token) {
        const node = this.stack[this.stack.length - 1]
        if (node && node.type === 'embed') {
          const embedNode = node as unknown as EmbedNode
          // Build the value (raw text representation)
          if (embedNode.heading) {
            embedNode.value = `![[${embedNode.target}#${embedNode.heading}]]`
          } else {
            embedNode.value = `![[${embedNode.target}]]`
          }
        }
        this.exit(token)
      },
    },
  }
}

/**
 * Creates a toMarkdown extension that serializes EmbedNode back to markdown.
 *
 * Produces:
 * - `![[target]]` when no heading is present
 * - `![[target#heading]]` when a heading fragment exists
 */
export function embedToMarkdown(): ToMarkdownExtension {
  return {
    handlers: {
      embed(node: EmbedNode): string {
        if (node.heading) {
          return `![[${node.target}#${node.heading}]]`
        }
        return `![[${node.target}]]`
      },
    },
  }
}
