/**
 * Registry of the property rows currently on screen, so `MarkdownView.metadataEditor.rendered`
 * can hand plugins the real rows (Nested Properties finds the row containing an element and asks
 * it to render again). The property editor registers each row; the compat layer only reads.
 */

/** One property row, in the shape Obsidian's `metadataEditor.rendered[]` entries have. */
export interface RenderedProperty {
  containerEl: HTMLElement
  /** The row's live entry; a plugin may set `entry.value` before forcing a re-render. */
  entry: { key: string; value: unknown }
  /** Draws the row again from `entry`; `force` also redraws when the value looks unchanged. */
  renderProperty: (entry: { key: string; value: unknown }, force?: boolean) => void
  /** Path of the note the row belongs to. */
  sourcePath: string
}

const rows = new Set<RenderedProperty>()

/** Adds a row; returns the function that removes it again. */
export function registerRenderedProperty(row: RenderedProperty): () => void {
  rows.add(row)
  return () => { rows.delete(row) }
}

/** The rows of one note (all rows when `sourcePath` is omitted), in document order. */
export function getRenderedProperties(sourcePath?: string): RenderedProperty[] {
  const matching = [...rows].filter((row) => sourcePath === undefined || row.sourcePath === sourcePath)
  return matching.sort((a, b) =>
    a.containerEl.compareDocumentPosition(b.containerEl) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  )
}
