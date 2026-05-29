/**
 * Utility for extracting all wikilinks from a Markdown string.
 *
 * Used by the knowledge-graph feature for link extraction.
 * Ignores wikilinks inside code blocks and inline code.
 * Returns position information for each link.
 */
import type { WikilinkInfo, WikilinkNode } from '../types'
import type { Node, Root, RootContent } from 'mdast'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { remarkWikilink } from './plugin'

/**
 * Extracts all wikilinks from a Markdown string.
 *
 * Parses the markdown using the wikilink plugin, then walks the
 * resulting MDAST tree collecting WikilinkNode instances. Wikilinks
 * inside code blocks and inline code are automatically skipped
 * (they are not parsed as wikilink nodes by the tokenizer, and
 * the visitor additionally skips code/inlineCode subtrees).
 *
 * @param markdown - The markdown string to extract wikilinks from.
 * @returns Array of WikilinkInfo objects with target, display, heading, and position.
 */
export function extractWikilinks(markdown: string): WikilinkInfo[] {
  const tree = unified()
    .use(remarkParse)
    .use(remarkWikilink)
    .parse(markdown)

  const links: WikilinkInfo[] = []
  visitWikilinks(tree, links)
  return links
}

/**
 * Recursively walks the MDAST tree collecting WikilinkNode instances.
 *
 * Skips `code` and `inlineCode` nodes (does not descend into them).
 * For each `wikilink` node found, extracts target, display, heading,
 * and position (line/column from node.position).
 */
function visitWikilinks(node: Root | RootContent | Node, result: WikilinkInfo[]): void {
  // Skip code and inlineCode nodes entirely
  if (node.type === 'code' || node.type === 'inlineCode') {
    return
  }

  // Collect wikilink nodes
  if (node.type === 'wikilink') {
    const wikilink = node as WikilinkNode
    const position = wikilink.position
    result.push({
      target: wikilink.target,
      display: wikilink.display,
      heading: wikilink.heading,
      position: {
        line: position?.start.line ?? 0,
        column: position?.start.column ?? 0,
      },
    })
    return
  }

  // Recurse into children if the node has them
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      visitWikilinks(child as Node, result)
    }
  }
}
