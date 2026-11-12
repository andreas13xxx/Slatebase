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
import { parseBase } from '@slatebase/shared-contracts'
import { serializeBase } from '@slatebase/shared-contracts'
import { runBaseQuery } from '../../bases/query-engine'
import type { BaseDocument, BaseGroupValue, BaseRow, BaseSortClause, BaseView, FileContent } from '@slatebase/shared-contracts'
import { applyFrontmatterChange } from '../../utils/frontmatterWriter'
import { parseFrontmatter } from '../context-panel/utils/parseFrontmatter'
import { onRealtimeVaultChange } from '../../state/realtimeVaultBridge'
import { requestVaultTreeRefresh } from '../../state/vaultTreeRefreshBridge'
import { requestReveal } from '../../state/revealFileBridge'
import { setActiveBasesController, clearActiveBasesController, tableToTsv } from '../../state/activeBasesBridge'
import type { ActiveBasesController } from '../../state/activeBasesBridge'
import { extractErrorMessage } from '../../utils/error'
import { hasBasesViewRegistration } from '../../plugins/compat/bases-view-registry'
import { ErrorBoundary } from '../ErrorBoundary'
import { BasesTableView } from './BasesTableView'
import { BasesKanbanView } from './BasesKanbanView'
import { BasesListView } from './BasesListView'
import { BasesCardsView } from './BasesCardsView'
import { BasesSourceView } from './BasesSourceView'
import { BasesToolbar } from './BasesToolbar'
import { BasesPluginViewHost } from './BasesPluginViewHost'
import { deriveBaseScopeFolder, buildBlankFrontmatter, resolveNewNotePath } from './base-add-item'
import { setGroupOrder } from './base-edit'
import { sortRowsByFormula } from './base-formula-sort'
import { FOLDER_GROUP_PROPERTY, folderMoveTarget } from './base-folder-move'
import { filterRowsByText } from './base-row-search'
import './BasesView.css'

export interface BasesViewProps {
  apiClient: IApiClient
  vaultId: string
  /** Raw `.base` file content. */
  source: string
  /** Vault-relative path of this `.base` file — what `this` refers to when a base is opened on its own. */
  hostPath?: string
  /** Whether the user may edit (write access). */
  readOnly: boolean
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
  /** Persist new `.base` file content (sort change, raw-source apply). */
  onSaveSource: (yaml: string) => void
  /**
   * Called after a note was moved to another folder from inside the view (a Kanban card dragged
   * between `file.folder` columns), so the host can update open tabs, favorites and shares.
   */
  onNoteMoved?: (oldPath: string, newPath: string) => void
  /**
   * `view` (default) renders the base; `source` shows its YAML. Owned by the host (the tab's mode,
   * switched from the breadcrumb), not by the view itself.
   */
  mode?: 'view' | 'source'
  /** Asks the host to leave source mode (after picking a view or running a `bases:*` command). */
  onShowView?: () => void
}

export const BasesView = memo(function BasesView({
  apiClient, vaultId, source, hostPath, readOnly, onOpenNote, onSaveSource, onNoteMoved, mode = 'view', onShowView,
}: BasesViewProps) {
  // Leaving source mode goes through a ref: the host passes a fresh callback every render, and the
  // `bases:*` controller effect below must not re-register on each of them.
  const showViewRef = useRef(onShowView)
  useEffect(() => { showViewRef.current = onShowView }, [onShowView])
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])
  const showView = useCallback(() => { if (modeRef.current === 'source') showViewRef.current?.() }, [])
  const [selectedViewIndex, setSelectedViewIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [rows, setRows] = useState<BaseRow[]>([])
  const [truncated, setTruncated] = useState(false)
  // Matches before the view's `limit` (Obsidian 1.15: "Showing 10 of 40").
  const [totalMatches, setTotalMatches] = useState(0)
  const [queryError, setQueryError] = useState<string | null>(null)
  // A failed user action (create an entry, move a card to another folder): shown next to the board,
  // not as a query failure, so it neither hides the truncation/limit notices nor outlives the next action.
  const [actionError, setActionError] = useState<string | null>(null)
  const [pluginViewError, setPluginViewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Parse the base source. A parse failure keeps the raw source reachable.
  const parseResult = useMemo(() => parseBase(source), [source])
  const doc: BaseDocument | null = parseResult.success ? parseResult.document : null
  const views = doc?.views ?? []
  const safeIndex = selectedViewIndex < views.length ? selectedViewIndex : 0
  const activeView: BaseView | undefined = views[safeIndex]

  // A view whose `type` a plugin registered renders via the plugin host; the
  // built-in types render in-app. An errored plugin view falls back to the
  // built-in table. `map` is deliberately NOT built-in: it is left entirely to
  // a plugin (Obsidian's Maps plugin registers `registerBasesView("map", …)`),
  // so a `type: map` view mounts the plugin's map when one is installed and
  // otherwise falls back to the table.
  const BUILT_IN_VIEW_TYPES = useMemo(() => new Set(['table', 'cards', 'kanban', 'list']), [])
  const isPluginView = useMemo(
    () => !!activeView && !BUILT_IN_VIEW_TYPES.has(activeView.type) && hasBasesViewRegistration(activeView.type) && !pluginViewError,
    [activeView, pluginViewError, BUILT_IN_VIEW_TYPES],
  )
  // Both board layouts share BasesKanbanView, differing only in orientation:
  // `kanban` groups into horizontal columns, a grouped `cards` view stacks the
  // groups as vertical rows (each a card grid). An ungrouped `cards` view is
  // the plain Obsidian image-card grid (BasesCardsView).
  const isKanbanView = !!activeView && !isPluginView && activeView.type === 'kanban'
  const isGroupedCardsView = !!activeView && !isPluginView && activeView.type === 'cards' && !!activeView.groupBy
  const isCardsView = !!activeView && activeView.type === 'cards' && !activeView.groupBy && !isPluginView
  const isListView = !!activeView && activeView.type === 'list' && !isPluginView

  // Formula columns are not sortable server-side (buildQuerySpec drops them),
  // so when the active view's first sort clause targets a formula column we
  // sort the already-fetched rows here by the evaluated value, stable on ties.
  const sortedRows = useMemo(
    () => (doc ? sortRowsByFormula(rows, doc, activeView) : rows),
    [rows, doc, activeView],
  )
  // Quick-search narrows the rendered rows (file name + visible values), after
  // sorting so the order is stable; empty query passes everything through.
  const displayRows = useMemo(
    () => filterRowsByText(sortedRows, searchQuery),
    [sortedRows, searchQuery],
  )

  const runQuery = useCallback(async () => {
    if (!doc || !activeView) return
    setLoading(true)
    try {
      const { rows: resultRows, total: resultTotal, truncated: resultTruncated } = await runBaseQuery(apiClient, vaultId, doc, activeView, hostPath)
      setRows(resultRows)
      setTotalMatches(resultTotal)
      setTruncated(resultTruncated)
      setQueryError(null)
    } catch (err) {
      setQueryError(extractErrorMessage(err, 'Die Base-Abfrage ist fehlgeschlagen'))
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId, doc, activeView, hostPath])

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

  const onNoteMovedRef = useRef(onNoteMoved)
  useEffect(() => { onNoteMovedRef.current = onNoteMoved }, [onNoteMoved])

  // Move a Kanban card to another column: write the grouping property of the
  // dragged note's frontmatter to the target column's value ('' clears it).
  const handleMoveCard = useCallback((path: string, property: string, newValue: string) => {
    if (property === FOLDER_GROUP_PROPERTY) {
      // Columns are folders: move the note itself (links are updated by the vault move).
      const target = folderMoveTarget(path, newValue)
      if (target === null) return
      setActionError(null)
      void apiClient.moveContent(vaultId, path, target).then(() => {
        // The backend's vault:change excludes the user who made the change, so refresh by hand
        // (rows + File Explorer tree) and let the host re-point tabs, favorites and shares.
        onNoteMovedRef.current?.(path, target)
        void runQueryRef.current()
        requestVaultTreeRefresh(vaultId)
      }).catch((err: unknown) => {
        setActionError(extractErrorMessage(err, 'Karte konnte nicht verschoben werden'))
      })
      return
    }
    void writeFrontmatter(path, (fm) => {
      if (newValue === '') fm[property] = undefined
      else fm[property] = newValue
    }, 'Karte konnte nicht verschoben werden')
  }, [writeFrontmatter, apiClient, vaultId])

  // Write a sort change back into the selected view in the `.base` file.
  const handleSortChange = useCallback((sort: BaseSortClause[]) => {
    if (!doc || !activeView || readOnly) return
    const nextViews = doc.views.map((v, i) => (i === safeIndex ? { ...v, sort } : v))
    onSaveSource(serializeBase({ ...doc, views: nextViews }))
  }, [doc, activeView, readOnly, onSaveSource, safeIndex])

  // Toolbar edits (views, sort, group, filter, properties) are functions applied
  // to the latest document we asked to save, so two quick edits compose instead of
  // the second overwriting the first while the file round-trip is still in flight.
  const pendingDocRef = useRef<BaseDocument | null>(null)
  useEffect(() => { pendingDocRef.current = null }, [source])
  const handleDocChange = useCallback((update: (d: BaseDocument) => BaseDocument) => {
    if (readOnly || !doc) return
    const next = update(pendingDocRef.current ?? doc)
    pendingDocRef.current = next
    onSaveSource(serializeBase(next))
  }, [readOnly, doc, onSaveSource])

  // Expose this base to the `bases:*` core commands (single-active-instance,
  // same as activeCanvasBridge).
  const rootRef = useRef<HTMLDivElement>(null)

  // Create a new note scoped to this base and open it. Shared by the
  // `bases:add-item` core command (via the controller below), the toolbar's
  // "Neuer Eintrag" button and each Kanban column's "+" button, so they cannot
  // drift. `overrides` pre-fills specific frontmatter keys (the Kanban column's
  // groupBy value) so the note lands in the right column.
  const addItem = useCallback(async (overrides: Record<string, string> = {}, folderOverride?: string): Promise<string | null> => {
    if (!doc) return null
    const view = doc.views[safeIndex]
    setActionError(null)
    const folder = folderOverride ?? deriveBaseScopeFolder(doc, view)
    const columns = (view?.order ?? Object.keys(doc.properties ?? {})).filter(
      (c) => !c.startsWith('file.') && !c.startsWith('formula.') && !(doc.formulas && c in doc.formulas),
    )
    const frontmatter = buildBlankFrontmatter(columns, doc, view, overrides)
    const baseName = 'Unbenannt'
    try {
      // Resolve a non-colliding file name under the target folder.
      const path = await resolveNewNotePath(apiClient, vaultId, folder, baseName)
      await apiClient.saveFile(vaultId, path, frontmatter)
      // The backend's vault:change excludes the user who triggered the write,
      // so our own SSE live-refresh never fires for a note we just created —
      // re-query directly so the new row shows up, and refresh the File
      // Explorer tree + reveal the new note there (the explorer has its own
      // `vaultTrees` cache that our query does not touch).
      void runQueryRef.current()
      requestVaultTreeRefresh(vaultId)
      requestReveal(path, 'file', vaultId)
      onOpenNote(path)
      return path
    } catch (err) {
      // Surface the failure (permissions, quota, network) instead of doing nothing on click.
      setActionError(extractErrorMessage(err, 'Eintrag konnte nicht angelegt werden'))
      return null
    }
  }, [doc, safeIndex, apiClient, vaultId, onOpenNote])

  // Fire-and-forget wrapper for the toolbar button (which wants `() => void`).
  const handleAddItem = useCallback(() => { void addItem() }, [addItem])

  // Per-column add in the Kanban view: pre-fill the grouping property with the
  // column's value so the new card appears in that column ('' clears it).
  const handleAddCardInColumn = useCallback((property: string, value: string) => {
    // Folder columns: the column's value is the folder to create the note in.
    if (property === FOLDER_GROUP_PROPERTY) { void addItem({}, value); return }
    void addItem(value === '' ? {} : { [property]: value })
  }, [addItem])

  // Persist a drag-reorder of the Kanban columns into the view's `groupOrder`.
  const handleReorderColumns = useCallback((groupOrder: BaseGroupValue[]) => {
    handleDocChange((d) => setGroupOrder(d, safeIndex, groupOrder))
  }, [handleDocChange, safeIndex])

  useEffect(() => {
    const controller: ActiveBasesController = {
      nextView: () => {
        if (views.length < 2) return false
        setSelectedViewIndex((safeIndex + 1) % views.length)
        showView()
        return true
      },
      addView: () => {
        if (!doc || readOnly) return false
        const name = `Tabelle ${doc.views.length + 1}`
        onSaveSource(serializeBase({ ...doc, views: [...doc.views, { type: 'table', name }] }))
        setSelectedViewIndex(doc.views.length)
        showView()
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
      addItem,
    }
    setActiveBasesController(controller)
    return () => clearActiveBasesController(controller)
  }, [views.length, safeIndex, doc, readOnly, onSaveSource, showView, addItem])

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
      <BasesToolbar
        doc={doc}
        rows={rows}
        activeIndex={safeIndex}
        readOnly={readOnly}
        mode={mode}
        onSelectView={(i) => { setSelectedViewIndex(i); showView() }}
        onChange={handleDocChange}
        onAddItem={handleAddItem}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      {queryError && <div className="bases-view__error" role="alert">{queryError}</div>}
      {actionError && (
        <div className="bases-view__error" role="alert">
          {actionError}
          <button type="button" className="bases-view__error-dismiss" onClick={() => setActionError(null)}>Schließen</button>
        </div>
      )}
      {truncated && !queryError && (
        <div className="bases-view__warning" role="status" aria-live="polite">
          Es werden nicht alle Treffer angezeigt — das Ergebnis wurde gekappt. Verfeinere die Filter, um alle passenden Notizen zu sehen.
        </div>
      )}
      {!queryError && activeView?.limit !== undefined && totalMatches > rows.length && (
        <div className="bases-view__hint" role="status" aria-live="polite">
          {`Zeigt ${String(rows.length)} von ${String(totalMatches)} (Limit der Ansicht)`}
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

      {mode === 'view' && !isPluginView && (isKanbanView || isGroupedCardsView) && activeView && (
        <BasesKanbanView
          doc={doc}
          view={activeView}
          rows={displayRows}
          layout={isKanbanView ? 'columns' : 'rows'}
          onOpenNote={onOpenNote}
          onMoveCard={readOnly ? undefined : handleMoveCard}
          onAddCard={readOnly ? undefined : handleAddCardInColumn}
          onReorderColumns={readOnly ? undefined : handleReorderColumns}
        />
      )}

      {mode === 'view' && !isPluginView && isCardsView && activeView && (
        <BasesCardsView
          doc={doc}
          view={activeView}
          rows={displayRows}
          vaultId={vaultId}
          onOpenNote={onOpenNote}
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

      {mode === 'view' && !isPluginView && !isKanbanView && !isGroupedCardsView && !isCardsView && !isListView && activeView && (
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
