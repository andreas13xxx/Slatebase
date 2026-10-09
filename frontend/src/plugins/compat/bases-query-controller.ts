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
import type { BaseDocument, BaseRow, BaseView } from '../../bases/types'
import type { PropertyType } from '../../state/propertyTypes'
import { runBaseQuery } from '../../bases/query-engine'
import { evaluateFormula } from '../../bases/formula/evaluator'
import type { FormulaContext } from '../../bases/formula/evaluator'
import { onRealtimeVaultChange } from '../../state/realtimeVaultBridge'
import { extractErrorMessage } from '../../utils/error'
import { toValue } from './bases-value-factory'
import { StringValue, NumberValue, BooleanValue, NullValue, type Value } from './bases-values'
import { warnOnce } from './log'

/** The subset of a BasesView instance this controller drives. */
export interface DrivableBasesView {
  type?: string
  config?: unknown
  allProperties?: string[]
  data?: unknown
  onDataUpdated?(): void
}

/** Builds a formula evaluation context from one row's raw values. */
function rowFormulaContext(row: BaseRow): FormulaContext {
  return {
    resolve: (name) => {
      if (name === 'file.name') return row.fileName
      const v = row.values[name]
      if (Array.isArray(v)) return v.length > 0 ? (v[0] ?? null) : null
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
      return null
    },
  }
}

/** Wraps a formula interpreter result as a Value. */
function formulaValue(src: string, row: BaseRow): Value {
  const result = evaluateFormula(src, rowFormulaContext(row))
  if (!result.ok) return NullValue.value
  const v = result.value
  if (v === null || v === undefined) return NullValue.value
  if (typeof v === 'number') return new NumberValue(v)
  if (typeof v === 'boolean') return new BooleanValue(v)
  return new StringValue(String(v))
}

/** Normalizes a raw row value into a string[] for the value factory. */
function toStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v))
  if (raw === undefined || raw === null) return []
  return [String(raw)]
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
  private readonly target: DrivableBasesView
  private readonly onError: (message: string) => void
  private unsubscribe: (() => void) | null = null
  private declaredTypes: Map<string, PropertyType> = new Map()
  private stopped = false

  constructor(opts: {
    apiClient: IApiClient
    vaultId: string
    doc: BaseDocument
    view: BaseView
    target: DrivableBasesView
    onError?: (message: string) => void
  }) {
    this.apiClient = opts.apiClient
    this.vaultId = opts.vaultId
    this.doc = opts.doc
    this.view = opts.view
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

  /** Re-runs the query and calls the view's onDataUpdated(). */
  async refresh(): Promise<void> {
    try {
      const { rows } = await runBaseQuery(this.apiClient, this.vaultId, this.doc, this.view)
      if (this.stopped) return
      const entries = rows.map((row) => this.buildEntry(row))
      const columns = this.view.order ?? Object.keys(this.doc.properties ?? {})
      this.target.allProperties = columns
      const QueryResult = window.obsidian?.['BasesQueryResult'] as unknown as (new (e: unknown[]) => unknown) | undefined
      this.target.data = QueryResult ? new QueryResult(entries) : entries
      try {
        this.target.onDataUpdated?.()
      } catch (err) {
        warnOnce('BasesQueryController.onDataUpdated', '[BasesQueryController] plugin onDataUpdated() threw:', err)
      }
    } catch (err) {
      if (!this.stopped) this.onError(extractErrorMessage(err, 'Die Base-Abfrage ist fehlgeschlagen'))
    }
  }

  /** Builds a BasesEntry (via the global class) for one row, with Value columns. */
  private buildEntry(row: BaseRow): unknown {
    const EntryCtor = window.obsidian?.['BasesEntry'] as unknown as (new (app?: unknown) => {
      file: unknown
      setValue(key: string, value: unknown): void
    }) | undefined
    const columns = this.view.order ?? Object.keys(this.doc.properties ?? {})
    const formulaKeys = new Set(Object.keys(this.doc.formulas ?? {}))

    const entry = EntryCtor ? new EntryCtor() : ({ file: null, setValue() {} } as { file: unknown; setValue(k: string, v: unknown): void })
    entry.file = { path: row.path, name: row.fileName }
    for (const col of columns) {
      if (formulaKeys.has(col)) {
        entry.setValue(col, formulaValue(this.doc.formulas?.[col] ?? '', row))
      } else if (col === 'file.name') {
        entry.setValue(col, new StringValue(row.fileName))
      } else {
        entry.setValue(col, toValue(toStringList(row.values[col]), this.declaredTypes.get(col)))
      }
    }
    return entry
  }

  /** Unsubscribes from live updates. Safe to call more than once. */
  stop(): void {
    this.stopped = true
    this.unsubscribe?.()
    this.unsubscribe = null
  }
}
