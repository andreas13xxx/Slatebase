/**
 * BasesQueryController — feeds a plugin-contributed Bases view its data.
 *
 * This is the bridge between a `Plugin_Bases_View` and Slatebase's existing
 * Bases data layer (the v1 Bases spec). It does NOT introduce a second query
 * pipeline: it calls the same `runBaseQuery` the built-in table uses, so a
 * plugin view and the built-in table see identical rows. Formula columns are
 * evaluated with the same `frontend/src/bases/formula/` interpreter.
 *
 * Each run produces `BasesEntry` objects whose column values are wrapped as
 * `Value` objects (via `bases-value-factory`), sets them on the view
 * (`view.data`, `view.allProperties`) and calls `view.onDataUpdated()`.
 * A `vault:change` event for this vault re-runs the query and calls
 * `onDataUpdated()` again — the same live-refresh behaviour as the table.
 *
 * @module bases-query-controller
 */

import type { IApiClient } from '../../api'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import type { PropertyType } from '../../state/propertyTypes'
import { runBaseQuery } from '../../bases/query-engine'
import { durationMs, evaluateFormulaColumn, formatFormulaValue, isDuration, rowValueKey } from '@slatebase/shared-contracts'
import { groupRows, UNGROUPED } from '../../components/bases/base-groups'
import { onRealtimeVaultChange } from '../../state/realtimeVaultBridge'
import { extractErrorMessage } from '../../utils/error'
import { toValue } from './bases-value-factory'
import { StringValue, NumberValue, BooleanValue, NullValue, type Value } from './bases-values'
import { warnOnce } from './log'
import { getActiveVaultShimRef, treeNodeToTFile } from './shims/vault-shim'
import type { DirectoryTree } from '../../types'

/** Rows whose note content is read ahead for the metadata cache, and how many reads run at once. */
const PREFETCH_MAX_ROWS = 100
const PREFETCH_CONCURRENCY = 5

/** The subset of a BasesView instance this controller drives. */
export interface DrivableBasesView {
  type?: string
  config?: unknown
  allProperties?: string[]
  data?: unknown
  onDataUpdated?(): void
}

/**
 * Evaluates one formula column for a row via the shared engine (same as the
 * built-in table), so a plugin view's formula columns see `file.*`, other
 * formulas and `this` exactly like the table does — rather than a separate,
 * narrower context.
 */
function formulaValue(doc: BaseDocument, row: BaseRow, formulaKey: string, thisRow: BaseRow | undefined): Value {
  const result = evaluateFormulaColumn(doc, row, formulaKey, thisRow)
  if (!result.ok) return NullValue.value
  const v = result.value
  if (v === null || v === undefined) return NullValue.value
  if (typeof v === 'number') return new NumberValue(v)
  if (typeof v === 'boolean') return new BooleanValue(v)
  // A duration reaches a plugin as its length in ms, like the arithmetic reads it.
  if (isDuration(v)) return new NumberValue(durationMs(v))
  return new StringValue(formatFormulaValue(v))
}

/** Normalizes a raw row value into a string[] for the value factory. */
function toStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v))
  if (raw === undefined || raw === null) return []
  return [String(raw)]
}

/**
 * The `TFile` for a row. Plugins treat `entry.file` as a real TFile — they read
 * `basename` (node labels, item titles), key `metadataCache.resolvedLinks` by
 * its `path` and hand it to `getFileCache()`. Prefer the vault's own object;
 * synthesize one with the same shape when the file is not in the tree yet.
 */
function resolveEntryFile(row: BaseRow): unknown {
  const vault = getActiveVaultShimRef() as { getFileByPath?(p: string): unknown } | null
  const found = vault?.getFileByPath?.(row.path)
  if (found) return found
  const name = row.path.split('/').pop() ?? row.path
  return treeNodeToTFile({ name, path: row.path, type: 'file' } as unknown as DirectoryTree, null)
}

/**
 * Drives a plugin Bases view. Call `start()` once (runs the first query and
 * subscribes to live updates); call `stop()` on teardown. The controller
 * writes `data`/`allProperties`/`config` onto `view` before each
 * `onDataUpdated()`.
 */
export class BasesQueryController {
  private readonly apiClient: IApiClient
  private readonly vaultId: string
  private readonly doc: BaseDocument
  private readonly view: BaseView
  private readonly hostPath: string | undefined
  private readonly target: DrivableBasesView
  private readonly onError: (message: string) => void
  private unsubscribe: (() => void) | null = null
  private declaredTypes: Map<string, PropertyType> = new Map()
  private stopped = false
  /** Notes whose prefetch read failed; not retried on every refresh. */
  private readonly unreadable = new Set<string>()

  constructor(opts: {
    apiClient: IApiClient
    vaultId: string
    doc: BaseDocument
    view: BaseView
    /** Vault-relative path of the host note `this` refers to; absent when there is no host. */
    hostPath?: string
    target: DrivableBasesView
    onError?: (message: string) => void
  }) {
    this.apiClient = opts.apiClient
    this.vaultId = opts.vaultId
    this.doc = opts.doc
    this.view = opts.view
    this.hostPath = opts.hostPath
    this.target = opts.target
    this.onError = opts.onError ?? (() => {})
  }

  /** Runs the first query, loads declared property types, and subscribes to vault:change. */
  async start(): Promise<void> {
    try {
      const registry = await this.apiClient.getPropertyTypes(this.vaultId)
      for (const entry of registry.entries) this.declaredTypes.set(entry.key, entry.type)
    } catch {
      // A missing/failed property-type registry is non-fatal — fall back to inference.
    }
    await this.refresh()
    this.unsubscribe = onRealtimeVaultChange((event) => {
      if (event.vaultId === this.vaultId && !this.stopped) void this.refresh()
    })
  }

  /**
   * Property keys a plugin view references through its own view config (not
   * through `view.order`). The Maps plugin, for instance, reads
   * `config.getAsPropertyId('coordinates')` and then `entry.getValue(thatProp)`
   * — the referenced property is whatever STRING sits in the view's config
   * bucket (`_unknown`), e.g. `coordinates: geo`. These string values are
   * candidate property names, so request them as extra query columns; a value
   * that is not a real property simply returns no row value, which is harmless.
   */
  private pluginConfigColumns(): string[] {
    const u = this.view._unknown ?? {}
    const cols = new Set<string>()
    for (const value of Object.values(u)) {
      if (typeof value === 'string' && value.trim()) cols.add(value.trim())
    }
    return Array.from(cols)
  }

  /**
   * Hands each row's forward links (from the server's link index) to the
   * shared metadata cache, so `app.metadataCache.resolvedLinks` — which a
   * graph view walks for its edges — knows them without reading every note.
   */
  private publishIndexedLinks(rows: BaseRow[]): void {
    const cache = (window as unknown as { app?: { metadataCache?: { setIndexedLinks?(p: string, l: string[]): void } } })
      .app?.metadataCache
    if (typeof cache?.setIndexedLinks !== 'function') return
    for (const row of rows) {
      const links = row.values['file.links']
      cache.setIndexedLinks(row.path, Array.isArray(links) ? links.map(String) : [])
    }
  }

  /** Re-runs the query and calls the view's onDataUpdated(). */
  async refresh(): Promise<void> {
    try {
      const { rows, thisRow } = await runBaseQuery(
        this.apiClient, this.vaultId, this.doc, this.view, this.hostPath, this.pluginConfigColumns(),
      )
      if (this.stopped) return
      this.publishIndexedLinks(rows)
      const entries = rows.map((row) => this.buildEntry(row, thisRow))
      const columns = this.view.order ?? Object.keys(this.doc.properties ?? {})
      this.target.allProperties = columns
      const QueryResult = window.obsidian?.['BasesQueryResult'] as unknown as (new (e: unknown[], g?: unknown[], p?: string[]) => unknown) | undefined
      const groups = this.buildGroups(rows, entries)
      this.target.data = QueryResult ? new QueryResult(entries, groups, columns) : entries
      try {
        this.target.onDataUpdated?.()
      } catch (err) {
        warnOnce('BasesQueryController.onDataUpdated', '[BasesQueryController] plugin onDataUpdated() threw:', err)
      }
      void this.prefetchContent(rows)
    } catch (err) {
      if (!this.stopped) this.onError(extractErrorMessage(err, 'Die Base-Abfrage ist fehlgeschlagen'))
    }
  }

  /**
   * Reads the notes of the first rows so `metadataCache.getCache(path)` knows their
   * sections, headings and links — real Obsidian has this for every note up front.
   * Plugin cards use it, e.g. TaskNotes' "task has details" icon is shown only
   * when the cache reports a non-frontmatter section. Reads are bounded and run in
   * the background; the view is refreshed once if anything new was learned.
   */
  private async prefetchContent(rows: BaseRow[]): Promise<void> {
    const app = (window as unknown as { app?: {
      vault?: { getFileByPath?(p: string): unknown; read?(f: unknown): Promise<string> }
      metadataCache?: { getCache?(p: string): unknown }
    } }).app
    const vault = app?.vault
    const cache = app?.metadataCache
    if (!vault?.getFileByPath || !vault.read || !cache?.getCache) return
    const pending = rows
      .slice(0, PREFETCH_MAX_ROWS)
      .filter((r) => r.path.toLowerCase().endsWith('.md') && !this.unreadable.has(r.path) && !cache.getCache?.(r.path))
    if (pending.length === 0) return
    let learned = 0
    let next = 0
    const worker = async (): Promise<void> => {
      while (!this.stopped && next < pending.length) {
        const row = pending[next++]!
        const file = vault.getFileByPath?.(row.path)
        if (!file) continue
        try {
          await vault.read?.(file)
          learned++
        } catch {
          // An unreadable note keeps an empty cache entry and is not retried.
          this.unreadable.add(row.path)
        }
      }
    }
    await Promise.all(Array.from({ length: PREFETCH_CONCURRENCY }, worker))
    if (this.stopped || learned === 0) return
    try {
      this.target.onDataUpdated?.()
    } catch (err) {
      warnOnce('BasesQueryController.onDataUpdated', '[BasesQueryController] plugin onDataUpdated() threw:', err)
    }
  }

  /**
   * Splits the entries into `BasesEntryGroup`s per the view's `groupBy` (same
   * grouping as the built-in table: `groupOrder`, direction, "no value" last).
   * Returns `undefined` for an ungrouped view — `BasesQueryResult` then reports
   * the single key-less group Obsidian reports for it.
   */
  private buildGroups(rows: BaseRow[], entries: unknown[]): unknown[] | undefined {
    const grouped = groupRows(rows, this.view)
    if (!grouped) return undefined
    const GroupCtor = window.obsidian?.['BasesEntryGroup'] as unknown as (new () => { key: unknown; entries: unknown[] }) | undefined
    if (!GroupCtor) return undefined
    const entryByRow = new Map<BaseRow, unknown>(rows.map((row, i) => [row, entries[i]]))
    const property = rowValueKey(this.view.groupBy?.property ?? '')
    return grouped.map((g) => {
      const group = new GroupCtor()
      // A group of notes without a value has no key (`hasKey()` is false).
      group.key = g.key === UNGROUPED ? null : toValue([g.key], this.declaredTypes.get(property))
      group.entries = g.rows.map((r) => entryByRow.get(r))
      return group
    })
  }

  /** Builds a BasesEntry (via the global class) for one row, with Value columns. */
  private buildEntry(row: BaseRow, thisRow: BaseRow | undefined): unknown {
    const EntryCtor = window.obsidian?.['BasesEntry'] as unknown as (new (app?: unknown) => {
      file: unknown
      setValue(key: string, value: unknown): void
    }) | undefined
    const columns = this.view.order ?? Object.keys(this.doc.properties ?? {})
    const formulaKeys = new Set(Object.keys(this.doc.formulas ?? {}))

    const entry = EntryCtor ? new EntryCtor() : ({ file: null, setValue() {} } as { file: unknown; setValue(k: string, v: unknown): void })
    entry.file = resolveEntryFile(row)

    // `file.*` pseudo-properties resolve on every entry in Obsidian, whether or
    // not they are displayed columns — a chart's X axis (`x: file.name`) or a
    // timeline's title field reads them without listing them in `order`.
    entry.setValue('file.name', new StringValue(row.fileName))
    entry.setValue('file.path', new StringValue(row.path))

    // Displayed columns (incl. formula and file.* pseudo-columns).
    for (const col of columns) {
      const formulaKey = col.startsWith('formula.') ? col.slice('formula.'.length) : col
      if (formulaKeys.has(formulaKey)) {
        entry.setValue(col, formulaValue(this.doc, row, formulaKey, thisRow))
      } else if (col === 'file.name') {
        entry.setValue(col, new StringValue(row.fileName))
      } else {
        entry.setValue(col, toValue(toStringList(row.values[col]), this.declaredTypes.get(col)))
      }
    }

    // Every other property the query returned (e.g. a plugin's marker
    // properties like `coordinates`, which are not displayed columns). The
    // plugin reads them via `entry.getValue(<prop>)`, so they must be present
    // on the entry even though they are not in the view's column order.
    for (const key of Object.keys(row.values)) {
      if (columns.includes(key)) continue
      entry.setValue(key, toValue(toStringList(row.values[key]), this.declaredTypes.get(key)))
    }

    // Plugins such as TaskNotes build their cards from the note's raw properties
    // (`entry.properties`), not from `getValue()`. Without them only the title is
    // left. Bare keys, formulas and `file.*` excluded — those are not frontmatter.
    ;(entry as { properties?: Record<string, unknown> }).properties = this.rawProperties(row)

    return entry
  }

  /** The row's note properties as plain frontmatter-shaped values (bare keys). */
  private rawProperties(row: BaseRow): Record<string, unknown> {
    const props: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(row.values)) {
      if (key.startsWith('file.') || key.startsWith('formula.')) continue
      const bare = key.replace(/^note\./, '')
      const list = toStringList(raw)
      if (list.length === 0) continue
      const type = this.declaredTypes.get(key) ?? this.declaredTypes.get(bare)
      if (list.length > 1 || type === 'list' || type === 'tags') props[bare] = list
      else if (type === 'number' && list[0] !== undefined && list[0].trim() !== '' && Number.isFinite(Number(list[0]))) props[bare] = Number(list[0])
      else if (type === 'checkbox' && (list[0] === 'true' || list[0] === 'false')) props[bare] = list[0] === 'true'
      else props[bare] = list[0]
    }
    return props
  }

  /** Unsubscribes from live updates. Safe to call more than once. */
  stop(): void {
    this.stopped = true
    this.unsubscribe?.()
    this.unsubscribe = null
  }
}
