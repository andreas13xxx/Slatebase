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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IApiClient } from '../../api'
import { parseBase } from '../../bases/parser'
import { serializeBase } from '../../bases/serializer'
import { runBaseQuery } from '../../bases/query-engine'
import type { BaseDocument, BaseRow, BaseSortClause, BaseView } from '../../bases/types'
import { applyFrontmatterChange } from '../../utils/frontmatterWriter'
import { parseFrontmatter } from '../context-panel/utils/parseFrontmatter'
import { onRealtimeVaultChange } from '../../state/realtimeVaultBridge'
import { extractErrorMessage } from '../../utils/error'
import { hasBasesViewRegistration } from '../../plugins/compat/bases-view-registry'
import { ErrorBoundary } from '../ErrorBoundary'
import { BasesTableView } from './BasesTableView'
import { BasesKanbanView } from './BasesKanbanView'
import { BasesSourceView } from './BasesSourceView'
import { BasesPluginViewHost } from './BasesPluginViewHost'

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
  const [queryError, setQueryError] = useState<string | null>(null)
  const [pluginViewError, setPluginViewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Parse the base source. A parse failure keeps the raw source reachable.
  const parseResult = useMemo(() => parseBase(source), [source])
  const doc: BaseDocument | null = parseResult.success ? parseResult.document : null
  const views = doc?.views ?? []
  const safeIndex = selectedViewIndex < views.length ? selectedViewIndex : 0
  const activeView: BaseView | undefined = views[safeIndex]

  // A view whose `type` a plugin registered renders via the plugin host; the
  // built-in types (`table`, `cards`) and any other unregistered type render
  // in-app. An errored plugin view falls back to the built-in table.
  const BUILT_IN_VIEW_TYPES = useMemo(() => new Set(['table', 'cards']), [])
  const isPluginView = useMemo(
    () => !!activeView && !BUILT_IN_VIEW_TYPES.has(activeView.type) && hasBasesViewRegistration(activeView.type) && !pluginViewError,
    [activeView, pluginViewError, BUILT_IN_VIEW_TYPES],
  )
  const isKanbanView = !!activeView && activeView.type === 'cards' && !isPluginView

  const runQuery = useCallback(async () => {
    if (!doc || !activeView) return
    setLoading(true)
    try {
      const { rows: resultRows } = await runBaseQuery(apiClient, vaultId, doc, activeView)
      setRows(resultRows)
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

  // Commit a property-cell edit into the target note's frontmatter.
  const handleCommitCell = useCallback(async (path: string, property: string, values: string[]) => {
    const prevRows = rows
    try {
      const file = await apiClient.fetchFileContent(vaultId, path)
      const { data } = parseFrontmatter(file.content)
      const fm: Record<string, unknown> = { ...(data ?? {}) }
      if (values.length === 0) fm[property] = undefined
      else if (values.length === 1) fm[property] = values[0]
      else fm[property] = values
      const keyOrder = Object.keys(fm)
      const next = applyFrontmatterChange(file.content, fm, keyOrder)
      await apiClient.saveFile(vaultId, path, next)
      // The save triggers vault:change → runQuery refreshes the row set.
    } catch (err) {
      setQueryError(extractErrorMessage(err, 'Zelle konnte nicht gespeichert werden'))
      setRows(prevRows) // restore the previous value on failure
    }
  }, [apiClient, vaultId, rows])

  // Write a sort change back into the selected view in the `.base` file.
  const handleSortChange = useCallback((sort: BaseSortClause[]) => {
    if (!doc || !activeView || readOnly) return
    const nextViews = doc.views.map((v, i) => (i === safeIndex ? { ...v, sort } : v))
    onSaveSource(serializeBase({ ...doc, views: nextViews }))
  }, [doc, activeView, readOnly, onSaveSource, safeIndex])

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
    <div className="bases-view">
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
          rows={rows}
          onOpenNote={onOpenNote}
        />
      )}

      {mode === 'view' && !isPluginView && !isKanbanView && activeView && (
        <BasesTableView
          doc={doc}
          view={activeView}
          rows={rows}
          onOpenNote={onOpenNote}
          onCommitCell={(path, property, values) => void handleCommitCell(path, property, values)}
          onSortChange={handleSortChange}
        />
      )}

      {mode === 'source' && (
        <BasesSourceView source={source} readOnly={readOnly} onApplySource={onSaveSource} />
      )}
    </div>
  )
})
