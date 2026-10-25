/**
 * BasesEmbed — a read-only embedded Bases view for `![[file.base]]` and for an
 * inline ```` ```base ```` code block (bases:insert).
 *
 * Fetches the referenced `.base` (or takes the code block's YAML as `source`), parses it, runs its first (or named) view's
 * query against the vault, and renders a read-only table. Deliberately a
 * trimmed variant of BasesView: no view switcher, no cell editing, no sort
 * write-back — an embed is a snapshot inside another note, not the full editor.
 * Scope is the table view only (R5.1); a card/other view falls back to its
 * table-equivalent columns.
 *
 * `apiClient` is passed explicitly rather than only read from `AppContext`,
 * because the Live Preview path mounts this in a detached React root (a CM6
 * widget) where no provider is above it — same reason the note embed there
 * talks to the backend directly. In the reading-view path it falls back to the
 * `AppContext` client.
 */

import { memo, useContext, useEffect, useMemo, useState } from 'react'
import type { BaseDocument, BaseQueryResultWire, BaseQuerySpecWire, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { parseBase, runBaseQuery } from '../../bases'
import { AppContext } from '../../state'
import { BasesTableView } from './BasesTableView'
import { pickEmbedView } from './pickEmbedView'

/** The minimal API surface BasesEmbed needs — a subset of IApiClient. */
export interface IBasesEmbedApiClient {
  fetchFileContent(vaultId: string, path: string): Promise<{ content: string; isBinary: boolean }>
  queryBase(vaultId: string, spec: BaseQuerySpecWire): Promise<BaseQueryResultWire>
}

export interface BasesEmbedProps {
  vaultId: string
  /** Resolved vault-relative path of the embedded `.base` file. Ignored when `source` is set. */
  filePath?: string
  /** Inline `.base` YAML from a ```` ```base ```` code block; skips the file fetch. */
  source?: string
  /** The raw link text (for error messages and the header). Omitted for an inline block. */
  target?: string
  /** Name of the view to show (`![[file.base#View]]`); omitted for the first view. Ignored for an inline block. */
  viewName?: string
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
  /** Explicit client (CM6 widget); falls back to AppContext in reading view. */
  apiClient?: IBasesEmbedApiClient | null
}

export const BasesEmbed = memo(function BasesEmbed({ vaultId, filePath, source, target, viewName, onOpenNote, apiClient: explicitClient }: BasesEmbedProps) {
  const appContext = useContext(AppContext)
  const apiClient: IBasesEmbedApiClient | null = explicitClient ?? appContext?.apiClient ?? null

  const [doc, setDoc] = useState<BaseDocument | null>(null)
  const [view, setView] = useState<BaseView | null>(null)
  const [rows, setRows] = useState<BaseRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!apiClient) {
      setError('Kein API-Client verfügbar')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        let content = source
        if (content === undefined) {
          if (filePath === undefined) {
            setError('Keine Base angegeben')
            setLoading(false)
            return
          }
          content = (await apiClient.fetchFileContent(vaultId, filePath)).content
          if (cancelled) return
        }
        const parsed = parseBase(content)
        if (!parsed.success) {
          setError(`Ungültige Base: ${parsed.errors.map((e) => e.message).join('; ')}`)
          setLoading(false)
          return
        }
        const picked = pickEmbedView(parsed.document, source === undefined ? viewName : undefined)
        if ('error' in picked) {
          setError(picked.error)
          setLoading(false)
          return
        }
        const result = await runBaseQuery(apiClient, vaultId, parsed.document, picked.view)
        if (cancelled) return
        setDoc(parsed.document)
        setView(picked.view)
        setRows(result.rows)
        setLoading(false)
      } catch {
        if (cancelled) return
        setError(`Fehler beim Laden: ${target ?? 'Base'}`)
        setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [apiClient, vaultId, filePath, source, target, viewName])

  // The embedded view, forced to a read-only table.
  const tableView = useMemo<BaseView | null>(() => (view ? { ...view, type: 'table' } : null), [view])

  if (error) {
    return <div className="view-mode-embed view-mode-embed--missing bases-embed">{error}</div>
  }
  if (loading || !doc || !tableView) {
    return (
      <div className="view-mode-embed bases-embed bases-embed--loading">
        <span className="view-mode-embed-loading">Laden…</span>
      </div>
    )
  }

  return (
    <div className="view-mode-embed bases-embed">
      {target !== undefined && (
        <span className="view-mode-embed-header">
          <span className="view-mode-embed-title">{viewName ? `${target} › ${view?.name ?? viewName}` : target}</span>
        </span>
      )}
      <BasesTableView
        doc={doc}
        view={tableView}
        rows={rows}
        onOpenNote={onOpenNote}
        onCommitCell={() => { /* read-only in an embed */ }}
        onSortChange={() => { /* read-only in an embed */ }}
      />
    </div>
  )
})
