/**
 * mdast-util for wikilink syntax.
 *
 * Provides fromMarkdown and toMarkdown extensions that convert
 * micromark wikilink tokens into WikilinkNode MDAST nodes and
 * serialize them back to markdown.
 */
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown'
import type { Options as ToMarkdownExtension } from 'mdast-util-to-markdown'
import type { WikilinkNode } from '../types'

/**
 * Creates a fromMarkdown extension that converts wikilink tokens
 * into WikilinkNode MDAST nodes.
 *
 * Token structure from syntax.ts:
 * - wikilink (wrapper)
 * - wikilinkMarker (the `[[` and `]]`)
 * - wikilinkData (wrapper for content between markers)
 * - wikilinkTarget (the target text)
 * - wikilinkSeparator (the `|`)
 * - wikilinkDisplay (the display text after `|`)
 * - wikilinkHeadingMarker (the `#`)
 * - wikilinkHeading (the heading text after `#`)
 *
 * Block references: when the heading text starts with `^`, it's treated
 * as a blockRef (e.g., `[[page#^block-id]]` → blockRef: "block-id").
 * blockRef and heading are mutually exclusive.
 */
export function wikilinkFromMarkdown(): FromMarkdownExtension {
  let target = ''
  let heading: string | null = null
  let display: string | null = null

  return {
    enter: {
      wikilink(this, token) {
        // Reset state for each new wikilink
        target = ''
        heading = null
        display = null

        const node: WikilinkNode = {
          type: 'wikilink',
          target: '',
          display: '',
          heading: null,
          blockRef: null,
          value: '',
        }
        this.enter(node, token)
      },
    },
    exit: {
      wikilinkTarget(this, token) {
        target = this.sliceSerialize(token)
      },
      wikilinkHeading(this, token) {
        heading = this.sliceSerialize(token)
      },
      wikilinkDisplay(this, token) {
        display = this.sliceSerialize(token)
      },
      wikilink(this, token) {
        const node = this.stack[this.stack.length - 1] as WikilinkNode

        node.target = target

        // Determine if heading is actually a block reference
        let blockRef: string | null = null
        let actualHeading: string | null = heading

        if (heading !== null && heading.startsWith('^')) {
          // It's a block reference: strip the `^` prefix
          blockRef = heading.slice(1)
          actualHeading = null
        }

        node.heading = actualHeading
        node.blockRef = blockRef

        // Determine display text:
        // 1. If explicit display text was provided, use it
        // 2. If blockRef exists but no display, use "target > ^block-id" (or just "^block-id" if target is empty)
        // 3. If heading exists but no display, use "target > heading" (or just heading if target is empty)
        // 4. Otherwise, use target
        if (display !== null) {
          node.display = display
        } else if (blockRef !== null) {
          node.display = target ? `${target} > ^${blockRef}` : `^${blockRef}`
        } else if (actualHeading !== null) {
          node.display = target ? `${target} > ${actualHeading}` : actualHeading
        } else {
          node.display = target
        }

        // Build the raw value for the Literal interface
        node.value = buildWikilinkValue(target, actualHeading, blockRef, display)

        this.exit(token)
      },
    },
  }
}

/**
 * Creates a toMarkdown extension that serializes WikilinkNode
 * MDAST nodes back to wikilink markdown syntax.
 *
 * Serialization rules:
 * - If target is empty and heading exists: `[[#heading]]`
 * - If target is empty and blockRef exists: `[[#^block-id]]`
 * - If target and heading exist (and display is default): `[[target#heading]]`
 * - If target and blockRef exist (and display is default): `[[target#^block-id]]`
 * - If target and display differ from target: `[[target|display]]`
 * - Otherwise: `[[target]]`
 */
export function wikilinkToMarkdown(): ToMarkdownExtension {
  return {
    handlers: {
      wikilink(node: WikilinkNode): string {
        const { target, heading, blockRef, display } = node

        // Case: heading-only link [[#heading]]
        if (!target && heading) {
          return `[[#${heading}]]`
        }

        // Case: block-ref-only link [[#^block-id]]
        if (!target && blockRef) {
          return `[[#^${blockRef}]]`
        }

        // Case: target with block reference [[target#^block-id]]
        if (target && blockRef) {
          const defaultDisplay = `${target} > ^${blockRef}`
          if (display === defaultDisplay) {
            return `[[${target}#^${blockRef}]]`
          }
          // If display differs from default, use pipe syntax
          return `[[${target}#^${blockRef}|${display}]]`
        }

        // Case: target with heading [[target#heading]]
        // Only use this form if display matches the default "target > heading"
        if (target && heading) {
          const defaultDisplay = `${target} > ${heading}`
          if (display === defaultDisplay) {
            return `[[${target}#${heading}]]`
          }
          // If display differs from default, use pipe syntax
          return `[[${target}#${heading}|${display}]]`
        }

        // Case: target with custom display [[target|display]]
        if (target && display && display !== target) {
          return `[[${target}|${display}]]`
        }

        // Default case: simple link [[target]]
        return `[[${target}]]`
      },
    },
    unsafe: [
      { character: '[', after: '[', inConstruct: 'phrasing' },
      { character: ']', after: ']', inConstruct: 'phrasing' },
    ],
  }
}

/**
 * Builds the raw string value for a wikilink node (content between [[ and ]]).
 */
function buildWikilinkValue(
  target: string,
  heading: string | null,
  blockRef: string | null,
  display: string | null
): string {
  let value = target
  if (blockRef !== null) {
    value += `#^${blockRef}`
  } else if (heading !== null) {
    value += `#${heading}`
  }
  if (display !== null) {
    value += `|${display}`
  }
  return value
}
