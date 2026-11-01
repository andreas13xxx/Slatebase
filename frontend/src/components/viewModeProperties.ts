/**
 * Applies app.json `propertiesInDocument` to a parsed note for the reading view.
 */
import type { Root, RootContent } from 'mdast'

/**
 * `hidden` drops the frontmatter node, `source` turns it into a YAML code block with its `---`
 * fences, `visible` leaves the properties table.
 */
export function applyPropertiesInDocument(tree: Root, mode: 'visible' | 'hidden' | 'source'): void {
  if (mode === 'visible') return
  tree.children = tree.children.flatMap((node) => {
    if (node.type !== 'yaml') return [node]
    if (mode === 'hidden') return []
    return [{ type: 'code', lang: 'yaml', meta: null, value: `---\n${node.value}\n---` } as RootContent]
  })
}
