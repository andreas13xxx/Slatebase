/**
 * Bases module barrel export.
 * Types, parser, and serializer for Obsidian-compatible `.base` files.
 */

export type {
  BaseFilterNode,
  BaseFilterAnd,
  BaseFilterOr,
  BaseFilterNot,
  BaseFormulas,
  BaseColumnMeta,
  BaseProperties,
  BaseSortDirection,
  BaseSortClause,
  BaseGroupBy,
  BaseSummaries,
  BaseView,
  BaseDocument,
  BaseRow,
  BaseValidationError,
  BaseParseResult,
  BaseQuerySortWire,
  BaseQuerySpecWire,
  BaseQueryRowWire,
  BaseQueryResultWire,
} from './types'

export { parseBase } from './parser'
export { serializeBase } from './serializer'
export { buildQuerySpec, runBaseQuery } from './query-engine'
export { evaluateFormula, evaluateCondition, formatFormulaValue } from './formula/evaluator'
export type { FormulaContext, FormulaResult } from './formula/evaluator'
export type { FormulaValue } from './formula/functions'
