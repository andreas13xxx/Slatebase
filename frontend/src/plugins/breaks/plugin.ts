import type { Plugin } from 'unified'
import type { Root, Text, PhrasingContent, Parent } from 'mdast'
import { visit, SKIP } from 'unist-util-visit'

/**
 * Remark plugin that converts soft line breaks (single newlines) in text nodes
 * into hard breaks (<br> elements). This matches Obsidian's default behavior
 * where every newline within a paragraph produces a visible line break.
 *
 * Equivalent to remark-breaks but implemented inline to avoid an extra dependency.
 */
export const remarkBreaks: Plugin<[], Root> = function () {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (index == null || !parent || !('children' in parent)) return

      const value = node.value
      if (!value.includes('\n')) return

      // Split text on newlines and interleave with break nodes
      const parts = value.split('\n')
      const newChildren: PhrasingContent[] = []

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!
        if (part.length > 0) {
          newChildren.push({ type: 'text', value: part })
        }
        // Add a break node between parts (not after the last one)
        if (i < parts.length - 1) {
          newChildren.push({ type: 'break' })
        }
      }

      // Replace the original text node with the new children
      const parentChildren = (parent as Parent).children as PhrasingContent[]
      parentChildren.splice(index, 1, ...newChildren)

      // Return SKIP to prevent revisiting the newly inserted nodes
      // and adjust index to skip past all inserted nodes
      return [SKIP, index + newChildren.length] as const
    })
  }
}
