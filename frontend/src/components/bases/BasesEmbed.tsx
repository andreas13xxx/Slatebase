/**
 * BasesEmbed — a read-only embedded Bases view for `![[file.base]]` and for an
 * inline ```` ```base ```` code block (bases:insert).
 *
 * Fetches the referenced `.base` (or takes the code block's YAML as `source`), parses it, runs its first (or named) view's
 * query against the vault, and renders a read-only table. Deliberately a
 * trimmed variant of BasesView: no view switcher, no cell editing, no sort
 * write-back — an embed is a snapshot inside another note, not the full editor.
 * A view whose type a plugin registered (Maps, Base Graph, …) renders via that
 * plugin's view, same as the full `BasesView` — but only when the resolved
 * client is the real `IApiClient` (reading view, via `AppContext`); the Live
 * Preview path's detached client is too limited to drive a plugin's Component
 * lifecycle, so there it always falls back to the table-equivalent rendering
 * `embedViewKind()` picks (kanban/cards/list/table).
 *
 * `apiClient` is passed explicitly rather than only read from `AppContext`,
 * because the Live Preview path mounts this in a detached React root (a CM6
 * widget) where no provider is above it — same reason the note embed there
 * talks to the backend directly. In the reading-view path it falls back to the
 * `AppContext` client.
 */

import { memo, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { BaseDocument, BaseQueryResultWire, BaseQuerySpecWire, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { parseBase, runBaseQuery } from '../../bases'
import type { IApiClient } from '../../api'
import { AppContext } from '../../state'
import { onRealtimeVaultChange } from '../../state/realtimeVaultBridge'
import { ErrorBoundary } from '../ErrorBoundary'
import { BasesKanbanView } from './BasesKanbanView'
import { BasesListView } from './BasesListView'
import { BasesCardsView } from './BasesCardsView'
import { embedViewKind } from './pickEmbedView'
import { BasesTableView } from './BasesTableView'
import { BasesPluginViewHost } from './BasesPluginViewHost'
import { pickEmbedView } from './pickEmbedView'
import { hasBasesViewRegistration, subscribeBasesViewRegistry, getBasesViewRegistryVersion } from '../../plugins/compat/bases-view-registry'
import './BasesView.css'

/** View types the embed's own renderers cover; anything else may go to a plugin view instead. */
const BUILT_IN_EMBED_TYPES = new Set(['table', 'cards', 'kanban', 'list'])

/**
 * True when `client` is the real `IApiClient` (not the Live Preview widget's
 * narrower `IBasesEmbedApiClient`) — the minimum a plugin's Bases view needs
 * (property types, the full read/write surface its Component lifecycle may touch).
 */
function isFullApiClient(client: IBasesEmbedApiClient | null): client is IApiClient {
  return typeof (client as Partial<IApiClient> | null)?.getPropertyTypes === 'function'
}

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
        // Always fetch rows here too, even though a plugin view (below) runs its own query via
        // BasesQueryController: keeping this one extra round-trip is what lets the embed fall back
        // to the table-equivalent rendering on a plugin-view error without a second, reactive fetch.
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

  const [pluginViewError, setPluginViewError] = useState<string | null>(null)
  // Reset a stale plugin-view error when a REFETCH (not the initial load) changes the view's type
  // underneath us — e.g. the .base file was edited to swap `map` for `table`. Must not fire on the
  // very first time `view` is populated (undefined → its real type), which is not a change at all
  // and would otherwise clear an error the plugin host legitimately raised on this same mount.
  const prevViewTypeRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (prevViewTypeRef.current !== undefined && prevViewTypeRef.current !== view?.type) {
      setPluginViewError(null)
    }
    prevViewTypeRef.current = view?.type
  }, [view?.type])
  // The plugin registry fills asynchronously as plugins load — subscribe so a `map` (or other
  // plugin-only) embed switches from the table fallback to the real view once it registers.
  const registryVersion = useSyncExternalStore(subscribeBasesViewRegistry, getBasesViewRegistryVersion)
  const isPluginView = useMemo(
    () => !!view && !BUILT_IN_EMBED_TYPES.has(view.type) && hasBasesViewRegistration(view.type) && isFullApiClient(apiClient) && !pluginViewError,
    [view, apiClient, pluginViewError, registryVersion],
  )

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
      {isPluginView && isFullApiClient(apiClient) && (
        <ErrorBoundary
          onError={(err) => setPluginViewError(err.message)}
          fallback={<BasesTableView doc={doc} view={{ ...view, type: 'table' }} rows={rows} onOpenNote={onOpenNote} onCommitCell={() => {}} onSortChange={() => {}} />}
        >
          <BasesPluginViewHost
            apiClient={apiClient}
            vaultId={vaultId}
            doc={doc}
            view={view}
            hostPath={hostPath}
            onOpenNote={onOpenNote}
            onError={setPluginViewError}
          />
        </ErrorBoundary>
      )}
      {!isPluginView && kind === 'kanban' && (
        <BasesKanbanView doc={doc} view={view} rows={rows} vaultId={vaultId} onOpenNote={onOpenNote} />
      )}
      {!isPluginView && kind === 'cards' && (
        <BasesCardsView doc={doc} view={view} rows={rows} vaultId={vaultId} onOpenNote={onOpenNote} />
      )}
      {!isPluginView && kind === 'list' && (
        <BasesListView doc={doc} view={view} rows={rows} vaultId={vaultId} onOpenNote={onOpenNote} />
      )}
      {!isPluginView && kind === 'table' && (
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
