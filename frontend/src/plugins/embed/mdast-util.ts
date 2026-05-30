/**
 * mdast-util extension for Obsidian embed syntax.
 *
 * Provides fromMarkdown and toMarkdown handlers that convert between
 * micromark tokens and EmbedNode MDAST nodes.
 *
 * fromMarkdown: Converts embed tokens into EmbedNode with target, heading, display, embedType.
 * toMarkdown: Serializes EmbedNode back to `![[target]]`, `![[target#heading]]`, or `![[target|display]]`.
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
 * - `embedSeparator` (the `|` separator)
 * - `embedDisplay` (the display/size text after `|`)
 */
export function embedFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      embed(token) {
        const node: EmbedNode = {
          type: 'embed',
          target: '',
          heading: null,
          display: null,
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
      embedDisplay(token) {
        const display = this.sliceSerialize(token)
        const current = this.stack[this.stack.length - 1]
        if (current && current.type === 'embed') {
          const node = current as unknown as EmbedNode
          node.display = display
        }
      },
      embed(token) {
        const node = this.stack[this.stack.length - 1]
        if (node && node.type === 'embed') {
          const embedNode = node as unknown as EmbedNode
          // Build the value (raw text representation)
          let value = `![[${embedNode.target}`
          if (embedNode.heading) {
            value += `#${embedNode.heading}`
          }
          if (embedNode.display) {
            value += `|${embedNode.display}`
          }
          value += ']]'
          embedNode.value = value
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
 * - `![[target]]` when no heading or display is present
 * - `![[target#heading]]` when a heading fragment exists
 * - `![[target|display]]` when a display/size is present
 * - `![[target#heading|display]]` when both exist
 */
export function embedToMarkdown(): ToMarkdownExtension {
  return {
    handlers: {
      embed(node: EmbedNode): string {
        let value = `![[${node.target}`
        if (node.heading) {
          value += `#${node.heading}`
        }
        if (node.display) {
          value += `|${node.display}`
        }
        value += ']]'
        return value
      },
    },
  }
}
