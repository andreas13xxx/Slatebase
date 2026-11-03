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

import { memo, useContext, useEffect, useRef, useState } from 'react'
import type { BaseDocument, BaseQueryResultWire, BaseQuerySpecWire, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { parseBase, runBaseQuery } from '../../bases'
import { AppContext } from '../../state'
import { onRealtimeVaultChange } from '../../state/realtimeVaultBridge'
import { BasesKanbanView } from './BasesKanbanView'
import { BasesListView } from './BasesListView'
import { BasesCardsView } from './BasesCardsView'
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
  /** Vault-relative path of the note this base is embedded in — what `this` refers to in its filters and formulas. */
  hostPath?: string
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
  /** Explicit client (CM6 widget); falls back to AppContext in reading view. */
  apiClient?: IBasesEmbedApiClient | null
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

export const BasesEmbed = memo(function BasesEmbed({ vaultId, filePath, source, target, viewName, hostPath, onOpenNote, apiClient: explicitClient }: BasesEmbedProps) {
  const appContext = useContext(AppContext)
  const apiClient: IBasesEmbedApiClient | null = explicitClient ?? appContext?.apiClient ?? null

  const [doc, setDoc] = useState<BaseDocument | null>(null)
  const [view, setView] = useState<BaseView | null>(null)
  const [rows, setRows] = useState<BaseRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Bumped on a vault change: the effect below then re-queries WITHOUT the
  // loading flash (the old rows stay visible until the new ones arrive).
  const [refreshTick, setRefreshTick] = useState(0)
  const lastTickRef = useRef(0)

  useEffect(() => {
    if (!apiClient) {
      setError('Kein API-Client verfügbar')
      setLoading(false)
      return
    }
    let cancelled = false
    const silent = refreshTick !== lastTickRef.current
    lastTickRef.current = refreshTick
    if (!silent) {
      setLoading(true)
      setError(null)
    }

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
        if (cancelled) return
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
        const result = await runBaseQuery(apiClient, vaultId, parsed.document, picked.view, hostPath)
        if (cancelled) return
        setDoc(parsed.document)
        setView(picked.view)
        setRows(result.rows)
        setError(null)
        setLoading(false)
      } catch {
        if (cancelled) return
        if (silent) return // a failed background refresh keeps the last good rows
        setError(`Fehler beim Laden: ${target ?? 'Base'}`)
        setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [apiClient, vaultId, filePath, source, target, viewName, hostPath, refreshTick])

  // Live refresh: any change in this vault (the host note's `this.*`, a target
  // note, or the .base file itself) re-runs the query.
  useEffect(() => {
    return onRealtimeVaultChange((event) => {
      if (event.vaultId === vaultId) setRefreshTick((n) => n + 1)
    })
  }, [vaultId])

  if (error) {
    return <div className="view-mode-embed view-mode-embed--missing bases-embed">{error}</div>
  }
  if (loading || !doc || !view) {
    return (
      <div className="view-mode-embed bases-embed bases-embed--loading">
        <span className="view-mode-embed-loading">Laden…</span>
      </div>
    )
  }

  const kind = embedViewKind(view)

  return (
    <div className="view-mode-embed bases-embed">
      {target !== undefined && (
        <span className="view-mode-embed-header">
          <span className="view-mode-embed-title">{viewName ? `${target} › ${view?.name ?? viewName}` : target}</span>
        </span>
      )}
      {kind === 'kanban' && (
        <BasesKanbanView doc={doc} view={view} rows={rows} onOpenNote={onOpenNote} />
      )}
      {kind === 'cards' && (
        <BasesCardsView doc={doc} view={view} rows={rows} vaultId={vaultId} onOpenNote={onOpenNote} />
      )}
      {kind === 'list' && (
        <BasesListView doc={doc} view={view} rows={rows} onOpenNote={onOpenNote} />
      )}
      {kind === 'table' && (
        <BasesTableView
          doc={doc}
          view={{ ...view, type: 'table' }}
          rows={rows}
          onOpenNote={onOpenNote}
          onCommitCell={() => { /* read-only in an embed */ }}
          onSortChange={() => { /* read-only in an embed */ }}
        />
      )}
    </div>
  )
})
