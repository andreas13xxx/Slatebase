import type { BaseDocument, BaseView } from '@slatebase/shared-contracts'

/**
 * Picks the view an embed shows: the first one, or the one named by
 * `![[file.base#View]]`. A name with no match is an error, never a silent
 * fallback to the first view — the author asked for a specific one.
 */
export function pickEmbedView(doc: BaseDocument, viewName: string | undefined): { view: BaseView } | { error: string } {
  const name = viewName?.trim()
  if (name) {
    const named = doc.views.find((v) => v.name === name)
    return named ? { view: named } : { error: `Ansicht nicht gefunden: ${name}` }
  }
  const first = doc.views[0]
  return first ? { view: first } : { error: 'Base hat keine Ansicht' }
}

/**
 * Which renderer an embedded view uses. Mirrors `BasesView`: a `kanban` or a
 * grouped `cards` view is the board, an ungrouped `cards` view the card grid,
 * `list` the list. Everything else (`table`, `map` — it needs the operator's
 * tile config —, unknown or plugin types) falls back to the read-only table.
 */
export function embedViewKind(view: BaseView): 'table' | 'kanban' | 'cards' | 'list' {
  if (view.type === 'kanban' || (view.type === 'cards' && view.groupBy)) return 'kanban'
  if (view.type === 'cards') return 'cards'
  if (view.type === 'list') return 'list'
  return 'table'
}
