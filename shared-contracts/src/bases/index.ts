/**
 * Bases module barrel export.
 * Types, parser, serializer and expression engine for Obsidian-compatible
 * `.base` files — pure logic shared by the frontend and the backend.
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
} from './types.js'

export { parseBase } from './parser.js'
export { serializeBase } from './serializer.js'
export { buildQuerySpec, rowContext, filterRows, evaluateFormulaColumn } from './base-eval.js'
export { evaluateFormula, evaluateCondition, formatFormulaValue, collectExpressionRefs } from './formula/evaluator.js'
export type { FormulaContext, FormulaResult } from './formula/evaluator.js'
export type { FormulaValue } from './formula/functions.js'
