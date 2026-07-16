import type { Root, Blockquote, Paragraph, Text, PhrasingContent, RootContent } from 'mdast'
import { visit } from 'unist-util-visit'
import type { CalloutNode } from '../types'

const CALLOUT_REGEX = /^\[!(\w+)\]([+-])?\s*(.*)?$/

/**
 * Transforms blockquote nodes containing Obsidian callout syntax into CalloutNode instances.
 *
 * Detects the pattern `> [!type] Title` in the first paragraph of a blockquote
 * and replaces the blockquote with a structured CalloutNode.
 */
export function transformCallouts(tree: Root): void {
  visit(tree, 'blockquote', (node: Blockquote, index, parent) => {
    if (index === undefined || index === null || !parent) return

    const firstChild = node.children[0]
    if (firstChild?.type !== 'paragraph') return

    const paragraph = firstChild as Paragraph
    const firstInline = paragraph.children[0]
    if (firstInline?.type !== 'text') return

    const textNode = firstInline as Text
    const firstLine = textNode.value.split('\n')[0]?.replace(/\r$/, '')
    if (!firstLine) return

    const match = CALLOUT_REGEX.exec(firstLine)
    if (!match) return

    const calloutType = (match[1] as string).toLowerCase()
    const foldMarker = match[2] as string | undefined
    const customTitle = match[3] as string | undefined

    const foldable = foldMarker === '+' || foldMarker === '-'
    const defaultOpen = foldMarker === '+'

    const title = customTitle && customTitle.trim().length > 0
      ? customTitle.trim()
      : calloutType.charAt(0).toUpperCase() + calloutType.slice(1)

    // Extract remaining inline content from the first paragraph after the callout header line
    const children = extractRemainingInlineContent(textNode, paragraph)

    // Remaining children of the blockquote (after the first paragraph) become the body
    const body: RootContent[] = node.children.slice(1) as RootContent[]

    const calloutNode: CalloutNode = {
      type: 'callout',
      calloutType,
      title,
      foldable,
      defaultOpen,
      children,
      body
    }

    // Replace the blockquote node in the parent's children array
    parent.children[index] = calloutNode as unknown as typeof parent.children[number]
  })
}

/**
 * Extracts remaining inline content from the first paragraph after the callout header line.
 *
 * The first text node may contain multiple lines (separated by \n).
 * The first line is the callout header — everything after it is inline content.
 * Additionally, any sibling phrasing nodes after the first text node are included.
 */
function extractRemainingInlineContent(
  firstTextNode: Text,
  paragraph: Paragraph
): PhrasingContent[] {
  const result: PhrasingContent[] = []

  // Check if the first text node has content beyond the first line
  // Strip \r from each line to handle CRLF line endings
  const lines = firstTextNode.value.split('\n').map(l => l.replace(/\r$/, ''))
  if (lines.length > 1) {
    const remainingText = lines.slice(1).join('\n')
    if (remainingText.length > 0) {
      result.push({ type: 'text', value: remainingText })
    }
  }

  // Include all sibling phrasing nodes after the first text node
  for (let i = 1; i < paragraph.children.length; i++) {
    const child = paragraph.children[i]
    if (child) {
      result.push(child)
    }
  }

  return result
}
