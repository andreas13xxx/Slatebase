/**
 * Writes a whole frontmatter data object into an editor document. Shared by the
 * Live Preview properties box and the plugin-facing `metadataEditor`, so both
 * touch only the YAML span (or the whole block when it ends up empty) and never
 * the rest of the note — the cursor and scroll position elsewhere stay put.
 */

import type { EditorView } from '@codemirror/view'
import { locateFrontmatterBlock, serializeFrontmatter } from '../utils/frontmatterWriter'

/** Replaces the document's frontmatter with `data`; adds a block when there is none, removes it when `data` is empty. */
export function commitFrontmatterData(view: EditorView, data: Record<string, unknown>): void {
  const content = view.state.doc.toString()
  const location = locateFrontmatterBlock(content)
  // null is a property left blank, not an absent one — it still gets a line,
  // so only a genuinely empty object may drop the whole block.
  const remaining = Object.entries(data).filter(([, v]) => v !== undefined)

  if (!location) {
    if (remaining.length === 0) return
    view.dispatch({ changes: { from: 0, to: 0, insert: `---\n${serializeFrontmatter(data)}\n---\n` } })
    return
  }

  if (remaining.length === 0) {
    const blockEnd = content.indexOf('\n', location.to + 1)
    const to = blockEnd === -1 ? content.length : blockEnd + 1
    view.dispatch({ changes: { from: 0, to, insert: '' } })
    return
  }

  view.dispatch({ changes: { from: location.from, to: location.to, insert: serializeFrontmatter(data) } })
}
