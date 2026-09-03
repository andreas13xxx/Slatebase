/**
 * Groups the vault's flat tag list into the hierarchy its names describe.
 *
 * A nested tag is one name with slashes in it — `Rezepte/Hauptspeise` is a
 * single tag, not a tag inside a folder. This turns the flat list into the tree
 * the names imply so the panel can collapse a family of tags into one row.
 */

import type { TagEntry } from '../../../state/documentPanelData'

export interface TagTreeNode {
  /** Last path segment — what the row shows (`Hauptspeise`). */
  segment: string
  /** Full tag name, what a click filters on (`Rezepte/Hauptspeise`). */
  name: string
  /**
   * Notes carrying exactly this tag. `0` marks a node that exists only because
   * something below it does: `#Rezepte/Hauptspeise` alone implies a `Rezepte`
   * row that no note is tagged with.
   */
  count: number
  /** Distinct notes in this node's whole subtree, itself included. */
  totalCount: number
  children: TagTreeNode[]
}

/**
 * Builds the tag tree, sorted alphabetically (case-insensitive) at every level.
 *
 * `totalCount` counts distinct notes rather than summing the children's counts:
 * a note tagged both `#Rezepte` and `#Rezepte/Hauptspeise` is one note, and
 * showing it twice in the parent row would not match the file list a click
 * opens. Entries without a `files` list fall back to the sum.
 *
 * @param entries - Flat tag list as the vault reports it
 * @returns Root-level nodes
 */
export function buildTagTree(entries: TagEntry[]): TagTreeNode[] {
  interface Builder {
    segment: string
    name: string
    count: number
    files: Set<string>
    /** Cleared once any entry in the subtree arrives without a file list. */
    filesKnown: boolean
    ownSum: number
    children: Map<string, Builder>
  }

  const roots = new Map<string, Builder>()

  function child(into: Map<string, Builder>, segment: string, name: string): Builder {
    let node = into.get(segment)
    if (!node) {
      node = { segment, name, count: 0, files: new Set(), filesKnown: true, ownSum: 0, children: new Map() }
      into.set(segment, node)
    }
    return node
  }

  for (const entry of entries) {
    // A leading/trailing or doubled slash would otherwise create empty rows.
    const segments = entry.name.split('/').filter((segment) => segment !== '')
    if (segments.length === 0) continue

    let level = roots
    let path = ''
    let node: Builder | null = null

    for (const segment of segments) {
      path = path === '' ? segment : `${path}/${segment}`
      node = child(level, segment, path)
      node.ownSum += entry.count
      if (entry.files) {
        for (const file of entry.files) node.files.add(file)
      } else {
        node.filesKnown = false
      }
      level = node.children
    }

    // Only the deepest node is the tag itself; the ones above are containers.
    if (node) node.count = entry.count
  }

  function finish(builders: Map<string, Builder>): TagTreeNode[] {
    return Array.from(builders.values())
      .map((builder) => ({
        segment: builder.segment,
        name: builder.name,
        count: builder.count,
        totalCount: builder.filesKnown ? builder.files.size : builder.ownSum,
        children: finish(builder.children),
      }))
      .sort((a, b) => a.segment.toLowerCase().localeCompare(b.segment.toLowerCase()))
  }

  return finish(roots)
}
