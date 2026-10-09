/**
 * Cell-type inference for Bases table cells — kept out of the component files
 * so each of those only exports components (react-refresh constraint).
 */

/** Inferred editing type for a property cell. */
export type BaseCellType = 'text' | 'number' | 'checkbox' | 'date' | 'list'

const BOOLEAN_RE = /^(true|false)$/i
const NUMBER_RE = /^-?\d+(\.\d+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/

/** Infers a cell editing type from a property's raw string values. */
export function inferCellType(values: string[]): BaseCellType {
  if (values.length > 1) return 'list'
  const first = values[0]
  if (first === undefined) return 'text'
  if (BOOLEAN_RE.test(first)) return 'checkbox'
  if (NUMBER_RE.test(first)) return 'number'
  if (DATE_RE.test(first)) return 'date'
  return 'text'
}
