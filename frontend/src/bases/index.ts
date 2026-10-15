/**
 * Bases module barrel export.
 * Types, parser, serializer and expression engine live in
 * `@slatebase/shared-contracts` (shared with the backend); this barrel
 * re-exports them next to the frontend-only query runner.
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
  FormulaContext,
  FormulaResult,
  FormulaValue,
} from '@slatebase/shared-contracts'

export {
  parseBase,
  serializeBase,
  evaluateFormula,
  evaluateCondition,
  formatFormulaValue,
} from '@slatebase/shared-contracts'
export { buildQuerySpec, runBaseQuery } from './query-engine'
