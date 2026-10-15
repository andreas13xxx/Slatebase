/**
 * Bases parser — validates and parses `.base` YAML files into a typed
 * `BaseDocument`, in the real Obsidian `.base` format (verified against
 * https://help.obsidian.md/bases/syntax). Manual validation with `_unknown`
 * passthrough for forward compatibility, mirroring the Canvas parser.
 *
 * Filters are EXPRESSION STRINGS in `and`/`or`/`not` groups (the shared
 * expression engine evaluates them); `groupBy` is an object; `summaries` and
 * a view `limit` are preserved. The earlier invented object-condition schema
 * is gone — a `.base` still using it fails with a clear error (full migration,
 * no backward compatibility).
 */

import { parse as parseYaml } from 'yaml'
import type {
  BaseColumnMeta,
  BaseDocument,
  BaseFilterNode,
  BaseFormulas,
  BaseGroupBy,
  BaseParseResult,
  BaseProperties,
  BaseSortClause,
  BaseSummaries,
  BaseValidationError,
  BaseView,
} from './types.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

const VALID_SORT_DIRECTIONS = ['asc', 'desc']

/**
 * Extracts unknown properties from a parsed object: known keys are removed,
 * remaining keys collect into the returned record (or undefined if none).
 */
function extractUnknown(raw: Record<string, unknown>, knownKeys: string[]): Record<string, unknown> | undefined {
  const unknown: Record<string, unknown> = {}
  let hasUnknown = false
  for (const key of Object.keys(raw)) {
    if (!knownKeys.includes(key)) {
      unknown[key] = raw[key]
      hasUnknown = true
    }
  }
  return hasUnknown ? unknown : undefined
}

// ─── Filter parsing ─────────────────────────────────────────────────────────

/**
 * Parses a filter node: a string expression (leaf), or an `and`/`or`/`not`
 * group. A legacy object condition (`{property, op, value}`) is rejected with
 * a clear migration error.
 */
function parseFilterNode(raw: unknown, path: string, errors: BaseValidationError[]): BaseFilterNode | null {
  if (isString(raw)) return raw

  if (!isObject(raw)) {
    errors.push({ message: 'Filter node must be an expression string or an and/or/not group', path })
    return null
  }

  const groupKey = (['and', 'or', 'not'] as const).find((k) => Array.isArray(raw[k]))
  if (!groupKey) {
    // Most likely the removed object-condition schema.
    if ('property' in raw || 'tag' in raw || 'op' in raw || 'value' in raw) {
      errors.push({
        message: 'Legacy object filter condition is no longer supported — use an Obsidian expression string, e.g. \'status == "done"\'',
        path,
      })
    } else {
      errors.push({ message: 'Filter group must be one of: and, or, not (a list of nodes)', path })
    }
    return null
  }

  const children: BaseFilterNode[] = []
  ;(raw[groupKey] as unknown[]).forEach((child, i) => {
    const parsed = parseFilterNode(child, `${path}.${groupKey}[${i}]`, errors)
    if (parsed !== null) children.push(parsed)
  })
  if (groupKey === 'and') return { and: children }
  if (groupKey === 'or') return { or: children }
  return { not: children }
}

// ─── Formula / summaries / properties parsing ────────────────────────────────

function parseStringMap(raw: unknown, label: string, errors: BaseValidationError[]): Record<string, string> | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    errors.push({ message: `${label} must be a mapping of id → string`, path: label })
    return undefined
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isString(value)) {
      errors.push({ message: `${label} "${key}" must be a string`, path: `${label}.${key}` })
      continue
    }
    out[key] = value
  }
  return out
}

function parseFormulas(raw: unknown, errors: BaseValidationError[]): BaseFormulas | undefined {
  return parseStringMap(raw, 'formulas', errors)
}

function parseSummaries(raw: unknown, errors: BaseValidationError[], label = 'summaries'): BaseSummaries | undefined {
  return parseStringMap(raw, label, errors)
}

const COLUMN_META_KEYS = ['displayName']

function parseProperties(raw: unknown, errors: BaseValidationError[]): BaseProperties | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    errors.push({ message: 'properties must be a mapping of column id → metadata', path: 'properties' })
    return undefined
  }
  const properties: BaseProperties = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isObject(value)) {
      errors.push({ message: `property "${key}" metadata must be an object`, path: `properties.${key}` })
      continue
    }
    const meta: BaseColumnMeta = {}
    if (isString(value['displayName'])) meta.displayName = value['displayName']
    const _unknown = extractUnknown(value, COLUMN_META_KEYS)
    if (_unknown) meta._unknown = _unknown
    properties[key] = meta
  }
  return properties
}

// ─── View parsing ─────────────────────────────────────────────────────────────

const VIEW_KEYS = ['type', 'name', 'order', 'sort', 'groupBy', 'filters', 'limit', 'summaries']

function parseSort(raw: unknown, path: string, errors: BaseValidationError[]): BaseSortClause[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) {
    errors.push({ message: 'view "sort" must be a list', path })
    return undefined
  }
  const clauses: BaseSortClause[] = []
  raw.forEach((entry, i) => {
    if (!isObject(entry) || !isString(entry['column'])) {
      errors.push({ message: 'sort clause must have a "column" string', path: `${path}[${i}]` })
      return
    }
    const clause: BaseSortClause = { column: entry['column'] }
    if (entry['direction'] !== undefined) {
      const dir = isString(entry['direction']) ? entry['direction'].toLowerCase() : ''
      if (!VALID_SORT_DIRECTIONS.includes(dir)) {
        errors.push({ message: 'sort "direction" must be asc or desc', path: `${path}[${i}].direction` })
      } else {
        clause.direction = dir as 'asc' | 'desc'
      }
    }
    clauses.push(clause)
  })
  return clauses
}

function parseGroupBy(raw: unknown, path: string, errors: BaseValidationError[]): BaseGroupBy | undefined {
  if (raw === undefined) return undefined
  // Obsidian uses an object; tolerate a bare string as `{ property }`.
  if (isString(raw)) return { property: raw }
  if (!isObject(raw) || !isString(raw['property'])) {
    errors.push({ message: 'view "groupBy" must be an object with a "property" string', path })
    return undefined
  }
  const group: BaseGroupBy = { property: raw['property'] }
  if (isString(raw['direction'])) group.direction = raw['direction']
  return group
}

function parseView(raw: unknown, index: number, errors: BaseValidationError[]): BaseView | null {
  if (!isObject(raw)) {
    errors.push({ message: 'view must be an object', path: `views[${index}]` })
    return null
  }
  if (!isString(raw['type'])) {
    errors.push({ message: 'view missing required field: type', path: `views[${index}].type` })
    return null
  }

  const view: BaseView = { type: raw['type'] }
  if (isString(raw['name'])) view.name = raw['name']
  if (Array.isArray(raw['order']) && raw['order'].every(isString)) {
    view.order = raw['order'] as string[]
  } else if (raw['order'] !== undefined) {
    errors.push({ message: 'view "order" must be a list of column ids', path: `views[${index}].order` })
  }
  const sort = parseSort(raw['sort'], `views[${index}].sort`, errors)
  if (sort) view.sort = sort
  const groupBy = parseGroupBy(raw['groupBy'], `views[${index}].groupBy`, errors)
  if (groupBy) view.groupBy = groupBy
  if (raw['filters'] !== undefined) {
    const vf = parseFilterNode(raw['filters'], `views[${index}].filters`, errors)
    if (vf !== null) view.filters = vf
  }
  if (typeof raw['limit'] === 'number') {
    view.limit = raw['limit']
  } else if (raw['limit'] !== undefined) {
    errors.push({ message: 'view "limit" must be a number', path: `views[${index}].limit` })
  }
  const summaries = parseSummaries(raw['summaries'], errors, `views[${index}].summaries`)
  if (summaries) view.summaries = summaries

  const _unknown = extractUnknown(raw, VIEW_KEYS)
  if (_unknown) view._unknown = _unknown

  return view
}

// ─── Main parser ──────────────────────────────────────────────────────────────

const TOP_LEVEL_KEYS = ['filters', 'formulas', 'properties', 'summaries', 'views']

/**
 * Parses a `.base` YAML string into a typed `BaseDocument`.
 *
 * A document with recoverable issues still returns `success: true` with a
 * non-fatal `errors` list; only unparseable YAML or a non-object root fails.
 */
export function parseBase(yaml: string): BaseParseResult {
  let raw: unknown
  try {
    raw = parseYaml(yaml)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid YAML'
    return { success: false, errors: [{ message: `YAML parse error: ${message}` }] }
  }

  // An empty document parses to null/undefined — treat as an empty base.
  if (raw === null || raw === undefined) {
    return { success: true, document: { views: [] } }
  }

  if (!isObject(raw)) {
    return { success: false, errors: [{ message: 'Base must be a YAML mapping' }] }
  }

  const errors: BaseValidationError[] = []

  const filters = raw['filters'] !== undefined
    ? parseFilterNode(raw['filters'], 'filters', errors) ?? undefined
    : undefined
  const formulas = parseFormulas(raw['formulas'], errors)
  const properties = parseProperties(raw['properties'], errors)
  const summaries = parseSummaries(raw['summaries'], errors)

  const views: BaseView[] = []
  if (raw['views'] !== undefined) {
    if (!Array.isArray(raw['views'])) {
      errors.push({ message: 'views must be a list', path: 'views' })
    } else {
      raw['views'].forEach((v, i) => {
        const view = parseView(v, i, errors)
        if (view) views.push(view)
      })
    }
  }

  const _unknown = extractUnknown(raw, TOP_LEVEL_KEYS)

  const document: BaseDocument = { views }
  if (filters !== undefined) document.filters = filters
  if (formulas) document.formulas = formulas
  if (properties) document.properties = properties
  if (summaries) document.summaries = summaries
  if (_unknown) document._unknown = _unknown

  return { success: true, document, errors: errors.length > 0 ? errors : undefined }
}
