import type { Extension as FromMarkdownExtension, Handle as FromMarkdownHandle } from 'mdast-util-from-markdown'
import type { Options as ToMarkdownExtension, Handle as ToMarkdownHandle } from 'mdast-util-to-markdown'
import type { TagNode } from '../types'

/**
 * Creates an mdast-util fromMarkdown extension for tag nodes.
 *
 * Converts micromark tag tokens into TagNode MDAST nodes.
 * Token types consumed: `tag` (wrapper), `tagMarker` (#), `tagValue` (the tag name).
 *
 * @returns A fromMarkdown extension
 */
export function tagFromMarkdown(): FromMarkdownExtension {
  const enterTag: FromMarkdownHandle = function (token) {
    const node: TagNode = {
      type: 'tag',
      tag: '',
      value: '',
    }
    this.enter(node, token)
    this.buffer()
  }

  const exitTagValue: FromMarkdownHandle = function (token) {
    const tagValue = this.sliceSerialize(token)
    const current = this.stack[this.stack.length - 1] as TagNode | undefined
    if (current && current.type === 'tag') {
      current.tag = tagValue
    }
  }

  const exitTag: FromMarkdownHandle = function (token) {
    const data = this.resume()
    const current = this.stack[this.stack.length - 1] as TagNode | undefined
    if (current && current.type === 'tag') {
      // The value field (from Literal) is the full string including #
      current.value = '#' + current.tag
    }
    this.exit(token)
    // data is unused but resume() must be called to match buffer()
    void data
  }

  return {
    enter: {
      tag: enterTag,
    },
    exit: {
      tagValue: exitTagValue,
      tag: exitTag,
    },
  }
}

/**
 * Creates an mdast-util toMarkdown extension for tag nodes.
 *
 * Serializes TagNode back to `#tagname` format.
 *
 * @returns A toMarkdown extension (Options)
 */
export function tagToMarkdown(): ToMarkdownExtension {
  const handleTag: ToMarkdownHandle = function (node) {
    const tagNode = node as TagNode
    return '#' + tagNode.tag
  }

  return {
    handlers: {
      tag: handleTag,
    },
  }
}
