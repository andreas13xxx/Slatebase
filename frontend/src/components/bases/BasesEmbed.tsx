/**
 * BasesEmbed — a read-only embedded Bases view for `![[file.base]]` (bases:insert).
 *
 * Fetches the referenced `.base`, parses it, runs its first (or named) view's
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

/** The minimal API surface BasesEmbed needs — a subset of IApiClient. */
export interface IBasesEmbedApiClient {
  fetchFileContent(vaultId: string, path: string): Promise<{ content: string; isBinary: boolean }>
  queryBase(vaultId: string, spec: BaseQuerySpecWire): Promise<BaseQueryResultWire>
}

export interface BasesEmbedProps {
  vaultId: string
  /** Resolved vault-relative path of the embedded `.base` file. */
  filePath: string
  /** The raw link text (for error messages). */
  target: string
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
  /** Explicit client (CM6 widget); falls back to AppContext in reading view. */
  apiClient?: IBasesEmbedApiClient | null
}

export const BasesEmbed = memo(function BasesEmbed({ vaultId, filePath, target, onOpenNote, apiClient: explicitClient }: BasesEmbedProps) {
  const appContext = useContext(AppContext)
  const apiClient: IBasesEmbedApiClient | null = explicitClient ?? appContext?.apiClient ?? null

  const [doc, setDoc] = useState<BaseDocument | null>(null)
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
        const file = await apiClient.fetchFileContent(vaultId, filePath)
        if (cancelled) return
        const parsed = parseBase(file.content)
        if (!parsed.success) {
          setError(`Ungültige Base: ${parsed.errors.map((e) => e.message).join('; ')}`)
          setLoading(false)
          return
        }
        const view = parsed.document.views[0]
        if (!view) {
          setError('Base hat keine Ansicht')
          setLoading(false)
          return
        }
        const result = await runBaseQuery(apiClient, vaultId, parsed.document, view)
        if (cancelled) return
        setDoc(parsed.document)
        setRows(result.rows)
        setLoading(false)
      } catch {
        if (cancelled) return
        setError(`Fehler beim Laden: ${target}`)
        setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [apiClient, vaultId, filePath, target])

  // The embedded view, forced to a read-only table.
  const tableView = useMemo<BaseView | null>(() => {
    if (!doc) return null
    const first = doc.views[0]
    if (!first) return null
    return { ...first, type: 'table' }
  }, [doc])

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
      <span className="view-mode-embed-header">
        <span className="view-mode-embed-title">{target}</span>
      </span>
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
