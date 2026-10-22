/**
 * BasesView — container for a `.base` file opened in a tab.
 *
 * Parses the base source, runs the backend query, renders the table (or the
 * raw-source fallback), and keeps the row set live by re-querying on a
 * `vault:change` event. Property-cell edits are written back into the target
 * note's frontmatter; a sort change is written back into the `.base` file.
 *
 * This component owns no vault state beyond its own fetched rows — it reads the
 * live metadata index on every query, so a deleted/renamed note never leaves a
 * stale row behind.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import type { IApiClient } from '../../api'
import { parseBase } from '@slatebase/shared-contracts'
import { serializeBase } from '@slatebase/shared-contracts'
import { runBaseQuery } from '../../bases/query-engine'
import type { BaseDocument, BaseRow, BaseSortClause, BaseView, FileContent } from '@slatebase/shared-contracts'
import { applyFrontmatterChange } from '../../utils/frontmatterWriter'
import { parseFrontmatter } from '../context-panel/utils/parseFrontmatter'
import { onRealtimeVaultChange } from '../../state/realtimeVaultBridge'
import { setActiveBasesController, clearActiveBasesController, tableToTsv } from '../../state/activeBasesBridge'
import type { ActiveBasesController } from '../../state/activeBasesBridge'
import { extractErrorMessage } from '../../utils/error'
import { hasBasesViewRegistration } from '../../plugins/compat/bases-view-registry'
import { ErrorBoundary } from '../ErrorBoundary'
import { BasesTableView } from './BasesTableView'
import { BasesKanbanView } from './BasesKanbanView'
import { BasesListView } from './BasesListView'
import { BasesSourceView } from './BasesSourceView'
import { BasesPluginViewHost } from './BasesPluginViewHost'
import { deriveBaseScopeFolder, buildBlankFrontmatter, resolveNewNotePath } from './base-add-item'
import { sortRowsByFormula } from './base-formula-sort'

// Lazy so Leaflet (+ its CSS) only loads when a `map` view is actually opened.
const BasesMapView = lazy(() => import('./BasesMapView').then((m) => ({ default: m.BasesMapView })))

export interface BasesViewProps {
  apiClient: IApiClient
  vaultId: string
  /** Raw `.base` file content. */
  source: string
  /** Whether the user may edit (write access). */
  readOnly: boolean
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
  /** Persist new `.base` file content (sort change, raw-source apply). */
  onSaveSource: (yaml: string) => void
}

type Mode = 'view' | 'source'

export const BasesView = memo(function BasesView({
  apiClient, vaultId, source, readOnly, onOpenNote, onSaveSource,
}: BasesViewProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [selectedViewIndex, setSelectedViewIndex] = useState(0)
  const [rows, setRows] = useState<BaseRow[]>([])
  const [truncated, setTruncated] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [pluginViewError, setPluginViewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Operator-configured map tile source, fetched lazily when a map view is shown.
  const [mapConfig, setMapConfig] = useState<{ tileUrl: string; attribution: string } | null>(null)

  // Parse the base source. A parse failure keeps the raw source reachable.
  const parseResult = useMemo(() => parseBase(source), [source])
  const doc: BaseDocument | null = parseResult.success ? parseResult.document : null
  const views = doc?.views ?? []
  const safeIndex = selectedViewIndex < views.length ? selectedViewIndex : 0
  const activeView: BaseView | undefined = views[safeIndex]

  // A view whose `type` a plugin registered renders via the plugin host; the
  // built-in types (`table`, `cards`) and any other unregistered type render
  // in-app. An errored plugin view falls back to the built-in table.
  const BUILT_IN_VIEW_TYPES = useMemo(() => new Set(['table', 'cards', 'list', 'map']), [])
  const isPluginView = useMemo(
    () => !!activeView && !BUILT_IN_VIEW_TYPES.has(activeView.type) && hasBasesViewRegistration(activeView.type) && !pluginViewError,
    [activeView, pluginViewError, BUILT_IN_VIEW_TYPES],
  )
  const isKanbanView = !!activeView && activeView.type === 'cards' && !isPluginView
  const isListView = !!activeView && activeView.type === 'list' && !isPluginView
  const isMapView = !!activeView && activeView.type === 'map' && !isPluginView

  // Formula columns are not sortable server-side (buildQuerySpec drops them),
  // so when the active view's first sort clause targets a formula column we
  // sort the already-fetched rows here by the evaluated value, stable on ties.
  const displayRows = useMemo(
    () => (doc ? sortRowsByFormula(rows, doc, activeView) : rows),
    [rows, doc, activeView],
  )

  const runQuery = useCallback(async () => {
    if (!doc || !activeView) return
    setLoading(true)
    try {
      const { rows: resultRows, truncated: resultTruncated } = await runBaseQuery(apiClient, vaultId, doc, activeView)
      setRows(resultRows)
      setTruncated(resultTruncated)
      setQueryError(null)
    } catch (err) {
      setQueryError(extractErrorMessage(err, 'Die Base-Abfrage ist fehlgeschlagen'))
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId, doc, activeView])

  // The built-in table owns the row fetch; a plugin view fetches via its own
  // QueryController, so only query here when the table is what renders.
  const tableIsActive = mode === 'view' && !isPluginView
  useEffect(() => { if (tableIsActive) void runQuery() }, [runQuery, tableIsActive])

  // Live refresh: re-query when any note in this vault changes (table only;
  // the plugin host's QueryController handles its own live refresh).
  const runQueryRef = useRef(runQuery)
  useEffect(() => { runQueryRef.current = runQuery }, [runQuery])
  useEffect(() => {
    return onRealtimeVaultChange((event) => {
      if (event.vaultId === vaultId && tableIsActive) void runQueryRef.current()
    })
  }, [vaultId, tableIsActive])

  // Reset a plugin-view error when the user switches to a different view
  // (but not on the initial mount, where the host may legitimately raise one).
  const prevIndexRef = useRef(safeIndex)
  useEffect(() => {
    if (prevIndexRef.current !== safeIndex) {
      prevIndexRef.current = safeIndex
      setPluginViewError(null)
    }
  }, [safeIndex])

  // Fetch the operator tile config the first time a map view is shown. It is a
  // per-instance operator value (not per-vault), so one fetch per BasesView is
  // enough; a failed read leaves `mapConfig` null and the map shows inactive.
  useEffect(() => {
    if (!isMapView || mapConfig !== null) return
    let cancelled = false
    void apiClient.getMapConfig()
      .then((cfg) => { if (!cancelled) setMapConfig(cfg) })
      .catch(() => { if (!cancelled) setMapConfig({ tileUrl: '', attribution: '' }) })
    return () => { cancelled = true }
  }, [isMapView, mapConfig, apiClient])

  // Write one note's frontmatter back to disk with optimistic concurrency:
  // read (capturing its ETag), apply `mutate`, save with `If-Match`. If the
  // file changed between read and write the backend returns CONFLICT; we then
  // re-read the current content, re-apply the mutation on top of it and retry
  // once, so a concurrent edit elsewhere is merged rather than overwritten.
  // Backs both the cell edit and the Kanban card move — one code path so the
  // two cannot drift. The save triggers vault:change → runQuery refreshes the
  // rows, so there is no optimistic row state to roll back here.
  const writeFrontmatter = useCallback(async (
    path: string,
    mutate: (fm: Record<string, unknown>) => void,
    conflictFallbackError: string,
  ): Promise<void> => {
    const applyAndSave = async (file: FileContent): Promise<void> => {
      const { data } = parseFrontmatter(file.content)
      const fm: Record<string, unknown> = { ...(data ?? {}) }
      mutate(fm)
      const next = applyFrontmatterChange(file.content, fm, Object.keys(fm))
      await apiClient.saveFile(vaultId, path, next, file.etag)
    }
    try {
      await applyAndSave(await apiClient.fetchFileContent(vaultId, path))
    } catch (err) {
      if ((err as { code?: string }).code === 'CONFLICT') {
        // The note changed since we read it — re-read and re-apply on top of
        // the current content, then save once more.
        await applyAndSave(await apiClient.fetchFileContent(vaultId, path))
        return
      }
      setQueryError(extractErrorMessage(err, conflictFallbackError))
    }
  }, [apiClient, vaultId])

  // Commit a property-cell edit into the target note's frontmatter.
  const handleCommitCell = useCallback((path: string, property: string, values: string[]) => {
    void writeFrontmatter(path, (fm) => {
      if (values.length === 0) fm[property] = undefined
      else if (values.length === 1) fm[property] = values[0]
      else fm[property] = values
    }, 'Zelle konnte nicht gespeichert werden')
  }, [writeFrontmatter])

  // Move a Kanban card to another column: write the grouping property of the
  // dragged note's frontmatter to the target column's value ('' clears it).
  const handleMoveCard = useCallback((path: string, property: string, newValue: string) => {
    void writeFrontmatter(path, (fm) => {
      if (newValue === '') fm[property] = undefined
      else fm[property] = newValue
    }, 'Karte konnte nicht verschoben werden')
  }, [writeFrontmatter])

  // Write a sort change back into the selected view in the `.base` file.
  const handleSortChange = useCallback((sort: BaseSortClause[]) => {
    if (!doc || !activeView || readOnly) return
    const nextViews = doc.views.map((v, i) => (i === safeIndex ? { ...v, sort } : v))
    onSaveSource(serializeBase({ ...doc, views: nextViews }))
  }, [doc, activeView, readOnly, onSaveSource, safeIndex])

  // Expose this base to the `bases:*` core commands (single-active-instance,
  // same as activeCanvasBridge).
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const controller: ActiveBasesController = {
      nextView: () => {
        if (views.length < 2) return false
        setSelectedViewIndex((safeIndex + 1) % views.length)
        setMode('view')
        return true
      },
      addView: () => {
        if (!doc || readOnly) return false
        const name = `Tabelle ${doc.views.length + 1}`
        onSaveSource(serializeBase({ ...doc, views: [...doc.views, { type: 'table', name }] }))
        setSelectedViewIndex(doc.views.length)
        setMode('view')
        return true
      },
      copyTable: async () => {
        const table = rootRef.current?.querySelector<HTMLTableElement>('table.bases-table')
        if (!table) return false
        try {
          await navigator.clipboard.writeText(tableToTsv(table))
          return true
        } catch {
          return false
        }
      },
      addItem: async () => {
        if (!doc) return null
        const view = doc.views[safeIndex]
        const folder = deriveBaseScopeFolder(doc, view)
        const columns = (view?.order ?? Object.keys(doc.properties ?? {})).filter(
          (c) => !c.startsWith('file.') && !c.startsWith('formula.') && !(doc.formulas && c in doc.formulas),
        )
        const frontmatter = buildBlankFrontmatter(columns, doc, view)
        const baseName = 'Unbenannt'
        try {
          // Resolve a non-colliding file name under the target folder.
          const path = await resolveNewNotePath(apiClient, vaultId, folder, baseName)
          await apiClient.saveFile(vaultId, path, frontmatter)
          onOpenNote(path)
          return path
        } catch {
          return null
        }
      },
    }
    setActiveBasesController(controller)
    return () => clearActiveBasesController(controller)
  }, [views.length, safeIndex, doc, readOnly, onSaveSource, apiClient, vaultId, onOpenNote])

  // Stable callback for the plugin host to report a render/query failure.
  const handlePluginViewError = useCallback((message: string) => {
    setPluginViewError(message)
  }, [])

  if (!doc) {
    return (
      <div className="bases-view bases-view--error">
        <div className="bases-view__error" role="alert">
          Diese .base-Datei konnte nicht gelesen werden: {parseResult.success ? '' : parseResult.errors[0]?.message}
        </div>
        <BasesSourceView source={source} readOnly={readOnly} onApplySource={onSaveSource} />
      </div>
    )
  }

  return (
    <div className="bases-view" ref={rootRef}>
      <div className="bases-view__toolbar">
        <span className="bases-view__title">{activeView?.name ?? 'Base'}</span>
        {/* View switcher: one button per declared view (plugin or built-in table). */}
        {views.length > 1 && (
          <div className="bases-view__views" role="tablist" aria-label="Ansichten">
            {views.map((v, i) => (
              <button
                key={`${v.type}-${i}`}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                className={i === safeIndex ? 'bases-view__view bases-view__view--active' : 'bases-view__view'}
                onClick={() => { setSelectedViewIndex(i); setMode('view') }}
              >
                {v.name ?? v.type}
              </button>
            ))}
          </div>
        )}
        <div className="bases-view__modes">
          <button
            type="button"
            className={mode === 'view' ? 'bases-view__mode bases-view__mode--active' : 'bases-view__mode'}
            onClick={() => setMode('view')}
          >
            Ansicht
          </button>
          <button
            type="button"
            className={mode === 'source' ? 'bases-view__mode bases-view__mode--active' : 'bases-view__mode'}
            onClick={() => setMode('source')}
          >
            Quelltext
          </button>
        </div>
      </div>

      {queryError && <div className="bases-view__error" role="alert">{queryError}</div>}
      {truncated && !queryError && (
        <div className="bases-view__warning" role="status" aria-live="polite">
          Es werden nicht alle Treffer angezeigt — das Ergebnis wurde gekappt. Verfeinere die Filter, um alle passenden Notizen zu sehen.
        </div>
      )}
      {pluginViewError && (
        <div className="bases-view__error" role="alert">
          Die Plugin-Ansicht ist fehlgeschlagen ({pluginViewError}) — es wird die Tabelle angezeigt.
        </div>
      )}
      {loading && tableIsActive && <div className="bases-view__loading" role="status" aria-live="polite">Lädt…</div>}

      {mode === 'view' && isPluginView && activeView && (
        <ErrorBoundary
          onError={(err) => setPluginViewError(err.message)}
          fallback={<div className="bases-view__error" role="alert">Die Plugin-Ansicht ist abgestürzt — es wird die Tabelle angezeigt.</div>}
        >
          <BasesPluginViewHost
            apiClient={apiClient}
            vaultId={vaultId}
            doc={doc}
            view={activeView}
            onOpenNote={onOpenNote}
            onError={handlePluginViewError}
          />
        </ErrorBoundary>
      )}

      {mode === 'view' && !isPluginView && isKanbanView && activeView && (
        <BasesKanbanView
          doc={doc}
          view={activeView}
          rows={displayRows}
          onOpenNote={onOpenNote}
          onMoveCard={readOnly ? undefined : handleMoveCard}
        />
      )}

      {mode === 'view' && !isPluginView && isListView && activeView && (
        <BasesListView
          doc={doc}
          view={activeView}
          rows={displayRows}
          onOpenNote={onOpenNote}
        />
      )}

      {mode === 'view' && !isPluginView && isMapView && activeView && (
        <Suspense fallback={<div className="bases-view__loading" role="status" aria-live="polite">Karte lädt…</div>}>
          <BasesMapView
            doc={doc}
            view={activeView}
            rows={displayRows}
            tileUrl={mapConfig?.tileUrl ?? ''}
            attribution={mapConfig?.attribution ?? ''}
            onOpenNote={onOpenNote}
          />
        </Suspense>
      )}

      {mode === 'view' && !isPluginView && !isKanbanView && !isListView && !isMapView && activeView && (
        <BasesTableView
          doc={doc}
          view={activeView}
          rows={displayRows}
          onOpenNote={onOpenNote}
          onCommitCell={handleCommitCell}
          onSortChange={handleSortChange}
        />
      )}

      {mode === 'source' && (
        <BasesSourceView source={source} readOnly={readOnly} onApplySource={onSaveSource} />
      )}
    </div>
  )
})
