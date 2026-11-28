/**
 * Bases value factory — wraps a raw link-index property value into the right
 * `Value` subclass for a plugin-contributed Bases view.
 *
 * The backend query returns each property's value as a `string[]` (the raw
 * frontmatter representation from the link index). A plugin-contributed Bases
 * view expects Obsidian `Value` objects instead. This factory does that
 * conversion, choosing the subclass from a declared property type when the
 * vault's Property-Type-Registry has one, otherwise from the same
 * `inferCellType` heuristic the built-in table cell uses — so a plugin view
 * and the built-in table classify a cell identically.
 *
 * @module bases-value-factory
 */

import { inferCellType, type BaseCellType } from '../../components/bases/base-cell-type'
import type { PropertyType } from '../../state/propertyTypes'
import {
  Value, NullValue, StringValue, NumberValue, BooleanValue, DateValue, ListValue, TagValue, LinkValue,
} from './bases-values'

/** Parse a raw string to a boolean, or null if it is not a boolean literal. */
function toBoolean(raw: string): boolean | null {
  if (/^true$/i.test(raw)) return true
  if (/^false$/i.test(raw)) return false
  return null
}

/** `[[Target]]` / `[[Target|Shown]]` — a text property holding exactly one wikilink is a link, as in Obsidian. */
const WIKILINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/

/** A string Value: a `LinkValue` for a lone wikilink, otherwise a `StringValue`. */
function textValue(raw: string): Value {
  const m = WIKILINK.exec(raw.trim())
  if (!m) return new StringValue(raw)
  const link = new LinkValue(m[1]!.trim())
  link.path = m[1]!.trim()
  if (m[2]) link.displayText = m[2]
  return link
}

/** Build a Value for a declared property type. */
function fromDeclaredType(type: PropertyType, values: string[]): Value {
  const first = values[0]
  switch (type) {
    case 'number': {
      const n = first === undefined ? NaN : Number(first)
      return Number.isFinite(n) ? new NumberValue(n) : NullValue.value
    }
    case 'checkbox': {
      const b = first === undefined ? null : toBoolean(first)
      return b === null ? NullValue.value : new BooleanValue(b)
    }
    case 'date':
    case 'datetime':
      return first === undefined ? NullValue.value : new DateValue(first)
    case 'list':
    case 'aliases':
      return new ListValue(values.map(textValue))
    case 'tags':
      return new ListValue(values.map((v) => new TagValue(v)))
    case 'text':
    default:
      return first === undefined ? NullValue.value : textValue(first)
  }
}

/** Build a Value for an inferred cell type (no declared type available). */
function fromInferredType(type: BaseCellType, values: string[]): Value {
  const first = values[0]
  switch (type) {
    case 'number':
      return first === undefined ? NullValue.value : new NumberValue(Number(first))
    case 'checkbox': {
      const b = first === undefined ? null : toBoolean(first)
      return b === null ? NullValue.value : new BooleanValue(b)
    }
    case 'date':
      return first === undefined ? NullValue.value : new DateValue(first)
    case 'list':
      return new ListValue(values.map(textValue))
    case 'text':
    default:
      return first === undefined ? NullValue.value : textValue(first)
  }
}

/**
 * Convert a raw property value (as the link index stores it) into a `Value`.
 *
 * @param values     Raw string values for the property on one note.
 * @param declaredType Declared type from the Property-Type-Registry, if any.
 * @returns the matching `Value`; `NullValue.value` for an absent value.
 */
export function toValue(values: string[] | undefined, declaredType?: PropertyType): Value {
  const list = values ?? []
  if (list.length === 0) return NullValue.value
  if (declaredType) return fromDeclaredType(declaredType, list)
  return fromInferredType(inferCellType(list), list)
}
