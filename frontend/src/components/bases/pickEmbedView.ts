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
