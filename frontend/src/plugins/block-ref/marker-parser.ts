/**
 * MDAST transformer that detects and strips block markers (` ^block-id`)
 * from paragraph, listItem, and heading nodes.
 *
 * Block markers are Obsidian's way of assigning unique IDs to blocks
 * so they can be referenced via `[[page#^block-id]]` syntax.
 *
 * Pattern: trailing ` ^block-id` where block-id matches [a-zA-Z0-9][a-zA-Z0-9-]*
 *
 * The transformer:
 * - Visits paragraph, listItem, and heading nodes
 * - Detects trailing ` ^block-id` in the last text node
 * - Strips the marker from visible content
 * - Stores the block ID as a `blockId` property on the node
 * - Skips markers inside code blocks and inline code
 */
import type { Root, Paragraph, Heading, ListItem, Text, PhrasingContent } from 'mdast'
import { visit } from 'unist-util-visit'

/**
 * Regex to match a block marker at the end of text content.
 * Captures the block-id (must start with alphanumeric, followed by alphanumeric or hyphens).
 * Tolerates an optional trailing \r to handle CRLF line endings (remark-parse preserves \r in text nodes).
 */
const BLOCK_MARKER_REGEX = / \^([a-zA-Z0-9][a-zA-Z0-9-]*)\r?$/

/**
 * Transforms the MDAST tree by detecting and stripping block markers
 * from paragraph, heading, and listItem nodes.
 *
 * For listItem nodes, we look at the last paragraph child.
 * For paragraph and heading nodes, we look at the last text child.
 *
 * IMPORTANT: ListItems must be processed BEFORE paragraphs, because
 * listItem processing looks at child paragraphs. If paragraph processing
 * runs first, the marker will already be assigned to the paragraph rather
 * than the listItem.
 */
export function transformBlockMarkers(tree: Root): void {
  // Track paragraphs that were already processed as part of a listItem
  const processedParagraphs = new WeakSet<Paragraph>()

  // Process listItems first — look at the last paragraph child
  visit(tree, 'listItem', (node: ListItem) => {
    // Find the last paragraph in the list item's children
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i]
      if (child && child.type === 'paragraph') {
        const para = child as Paragraph
        const blockId = extractBlockMarkerFromPhrasing(para.children)
        if (blockId) {
          ;(node as ListItem & { blockId: string }).blockId = blockId
          processedParagraphs.add(para)
        }
        break
      }
    }
  })

  // Process headings
  visit(tree, 'heading', (node: Heading) => {
    const blockId = extractBlockMarkerFromPhrasing(node.children)
    if (blockId) {
      ;(node as Heading & { blockId: string }).blockId = blockId
    }
  })

  // Process paragraphs (skip those already processed as part of listItems)
  visit(tree, 'paragraph', (node: Paragraph) => {
    if (processedParagraphs.has(node)) return
    const blockId = extractBlockMarkerFromPhrasing(node.children)
    if (blockId) {
      ;(node as Paragraph & { blockId: string }).blockId = blockId
    }
  })
}

/**
 * Extracts a block marker from the end of a phrasing content array.
 *
 * Looks at the last node in the array:
 * - If it's a text node ending with ` ^block-id`, strip the marker and return the ID
 * - If the last node is inlineCode, skip (code immunity)
 * - Otherwise return null
 *
 * @returns The block ID if found, or null
 */
function extractBlockMarkerFromPhrasing(children: PhrasingContent[]): string | null {
  if (children.length === 0) return null

  // Find the last text node (skip trailing whitespace-only nodes if needed)
  const lastChild = children[children.length - 1]
  if (!lastChild) return null

  // Code immunity: if the last node is inline code, don't process
  if (lastChild.type === 'inlineCode') return null

  // Only process text nodes
  if (lastChild.type !== 'text') return null

  const textNode = lastChild as Text
  const match = BLOCK_MARKER_REGEX.exec(textNode.value)
  if (!match) return null

  const blockId = match[1]!

  // Strip the marker from the text node
  textNode.value = textNode.value.slice(0, match.index)

  // If the text node becomes empty, remove it from children
  if (textNode.value === '') {
    children.pop()
  }

  return blockId
}
