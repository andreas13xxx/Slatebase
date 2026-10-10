/**
 * Bases parser — validates and parses `.base` YAML files into a typed
 * `BaseDocument`. Uses manual validation with `_unknown` passthrough for
 * forward compatibility, mirroring the Canvas parser: unknown fields survive
 * a parse → serialize round-trip so newer Obsidian `.base` fields are not lost.
 */

import { parse as parseYaml } from 'yaml'
import type {
  BaseColumnMeta,
  BaseDocument,
  BaseFilterCondition,
  BaseFilterNode,
  BaseFilterOperator,
  BaseFormulas,
  BaseParseResult,
  BaseProperties,
  BaseSortClause,
  BaseValidationError,
  BaseView,
} from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

const VALID_OPERATORS: BaseFilterOperator[] = ['eq', 'neq', 'contains', 'exists', 'empty', 'lt', 'lte', 'gt', 'gte']
const VALID_FILE_FIELDS = ['name', 'ctime', 'mtime']
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

const CONDITION_KEYS = ['property', 'tag', 'path', 'file', 'op', 'value', 'not']

/** Parses a single leaf filter condition. */
function parseCondition(raw: Record<string, unknown>, path: string, errors: BaseValidationError[]): BaseFilterCondition | null {
  const targets = [raw['property'], raw['tag'], raw['path'], raw['file']].filter((v) => v !== undefined)
  if (targets.length === 0) {
    errors.push({ message: 'Filter condition must target one of: property, tag, path, file', path })
    return null
  }
  if (targets.length > 1) {
    errors.push({ message: 'Filter condition must target exactly one of: property, tag, path, file', path })
    return null
  }

  const condition: BaseFilterCondition = {}

  if (isString(raw['property'])) condition.property = raw['property']
  if (isString(raw['tag'])) condition.tag = raw['tag']
  if (isString(raw['path'])) condition.path = raw['path']
  if (raw['file'] !== undefined) {
    if (!isString(raw['file']) || !VALID_FILE_FIELDS.includes(raw['file'])) {
      errors.push({ message: 'Filter "file" must be one of: name, ctime, mtime', path })
      return null
    }
    condition.file = raw['file'] as 'name' | 'ctime' | 'mtime'
  }

  if (raw['op'] !== undefined) {
    if (!isString(raw['op']) || !VALID_OPERATORS.includes(raw['op'] as BaseFilterOperator)) {
      errors.push({ message: `Filter "op" must be one of: ${VALID_OPERATORS.join(', ')}`, path })
      return null
    }
    condition.op = raw['op'] as BaseFilterOperator
  }

  const value = raw['value']
  if (value !== undefined) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      errors.push({ message: 'Filter "value" must be a string, number, or boolean', path })
      return null
    }
    condition.value = value
  }

  if (raw['not'] !== undefined) {
    if (typeof raw['not'] !== 'boolean') {
      errors.push({ message: 'Filter "not" must be a boolean', path })
      return null
    }
    condition.not = raw['not']
  }

  const _unknown = extractUnknown(raw, CONDITION_KEYS)
  if (_unknown) condition._unknown = _unknown

  return condition
}

/** Parses a filter node (leaf condition or nested AND/OR group), recursively. */
function parseFilterNode(raw: unknown, path: string, errors: BaseValidationError[]): BaseFilterNode | null {
  if (!isObject(raw)) {
    errors.push({ message: 'Filter node must be an object', path })
    return null
  }

  if (Array.isArray(raw['and'])) {
    const children: BaseFilterNode[] = []
    ;(raw['and'] as unknown[]).forEach((child, i) => {
      const parsed = parseFilterNode(child, `${path}.and[${i}]`, errors)
      if (parsed) children.push(parsed)
    })
    return { and: children }
  }

  if (Array.isArray(raw['or'])) {
    const children: BaseFilterNode[] = []
    ;(raw['or'] as unknown[]).forEach((child, i) => {
      const parsed = parseFilterNode(child, `${path}.or[${i}]`, errors)
      if (parsed) children.push(parsed)
    })
    return { or: children }
  }

  return parseCondition(raw, path, errors)
}

// ─── Formula / properties parsing ─────────────────────────────────────────────

function parseFormulas(raw: unknown, errors: BaseValidationError[]): BaseFormulas | undefined {
  if (raw === undefined) return undefined
  if (!isObject(raw)) {
    errors.push({ message: 'formulas must be a mapping of id → expression string', path: 'formulas' })
    return undefined
  }
  const formulas: BaseFormulas = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isString(value)) {
      errors.push({ message: `formula "${key}" must be an expression string`, path: `formulas.${key}` })
      continue
    }
    formulas[key] = value
  }
  return formulas
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

const VIEW_KEYS = ['type', 'name', 'order', 'sort', 'groupBy']

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
      if (!isString(entry['direction']) || !VALID_SORT_DIRECTIONS.includes(entry['direction'])) {
        errors.push({ message: 'sort "direction" must be asc or desc', path: `${path}[${i}].direction` })
      } else {
        clause.direction = entry['direction'] as 'asc' | 'desc'
      }
    }
    clauses.push(clause)
  })
  return clauses
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
  if (isString(raw['groupBy'])) {
    view.groupBy = raw['groupBy']
  } else if (raw['groupBy'] !== undefined) {
    errors.push({ message: 'view "groupBy" must be a property id', path: `views[${index}].groupBy` })
  }

  const _unknown = extractUnknown(raw, VIEW_KEYS)
  if (_unknown) view._unknown = _unknown

  return view
}

// ─── Main parser ──────────────────────────────────────────────────────────────

const TOP_LEVEL_KEYS = ['filters', 'formulas', 'properties', 'views']

/**
 * Parses a `.base` YAML string into a typed `BaseDocument`.
 *
 * - Validates YAML syntax
 * - Validates filters, formulas, properties, and views
 * - Preserves unknown fields for round-trip compatibility
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
  if (filters) document.filters = filters
  if (formulas) document.formulas = formulas
  if (properties) document.properties = properties
  if (_unknown) document._unknown = _unknown

  return { success: true, document, errors: errors.length > 0 ? errors : undefined }
}
