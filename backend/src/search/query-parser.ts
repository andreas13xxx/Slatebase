/**
 * Search query parser — extracts structured operators from a query string.
 *
 * Supported operators:
 *   path:<glob>        — include files matching glob pattern
 *   file:<pattern>     — include files whose name contains pattern
 *   tag:<tagname>      — include files with the given tag
 *   property:<key>     — include files with the property key
 *   property:<key>=<value> — include files with key=value
 *   -path:<glob>       — exclude files matching glob
 *   -file:<pattern>    — exclude files by name
 *   -tag:<tagname>     — exclude files with the tag
 *   -property:<key>    — exclude files with the property key
 *   -property:<key>=<value> — exclude files with key=value
 *
 * Values can be quoted: `path:"My Folder/**"` or `property:status="in progress"`
 * Unknown `foo:bar` patterns are kept as free-text (not treated as operators).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** A recognized operator type. */
export type OperatorType = 'path' | 'file' | 'tag' | 'property'

/** A single parsed operator from the query. */
export interface ParsedOperator {
  /** The operator type. */
  type: OperatorType
  /** Whether this is a negation operator (prefixed with -). */
  negated: boolean
  /** The raw value after the colon (unquoted). */
  value: string
  /** For property operators: the parsed property key. */
  propertyKey?: string | undefined
  /** For property operators: the parsed property value (after =). */
  propertyValue?: string | undefined
}

/** Result of parsing a search query. */
export interface ParsedQuery {
  /** Extracted structured operators. */
  operators: ParsedOperator[]
  /** Remaining free-text query after operators are removed (may be empty). */
  freeText: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Known operator keywords. Anything else is treated as free-text. */
const KNOWN_OPERATORS = new Set<string>(['path', 'file', 'tag', 'property'])

/**
 * Regex that matches operator tokens in the query string.
 * Groups: (1) negation prefix, (2) keyword, (3) value (quoted or unquoted).
 *
 * Quoted values: "..." with escaped quotes inside.
 * Unquoted values: everything up to the next whitespace.
 */
const OPERATOR_REGEX = /(-?)(path|file|tag|property):("(?:[^"\\]|\\.)*"|[^\s]+)/g

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parses a search query string, extracting structured operators.
 * Unrecognized `foo:bar` patterns are kept as free-text.
 * Supports quoted values: `path:"My Folder/**"`.
 */
export function parseSearchQuery(raw: string): ParsedQuery {
  const operators: ParsedOperator[] = []
  let freeText = raw

  // Extract all operator matches
  const matches: Array<{ fullMatch: string; negated: boolean; keyword: string; rawValue: string }> = []

  let match: RegExpExecArray | null
  // Reset lastIndex for safety (global regex)
  OPERATOR_REGEX.lastIndex = 0
  while ((match = OPERATOR_REGEX.exec(raw)) !== null) {
    const negationPrefix = match[1]!
    const keyword = match[2]!
    const rawValue = match[3]!

    if (!KNOWN_OPERATORS.has(keyword)) continue

    matches.push({
      fullMatch: match[0],
      negated: negationPrefix === '-',
      keyword,
      rawValue,
    })
  }

  // Remove matched operators from the free-text
  for (const m of matches) {
    freeText = freeText.replace(m.fullMatch, ' ')
  }

  // Normalize free-text whitespace
  freeText = freeText.replace(/\s+/g, ' ').trim()

  // Build operator list
  for (const m of matches) {
    const value = stripQuotes(m.rawValue)
    const operator: ParsedOperator = {
      type: m.keyword as OperatorType,
      negated: m.negated,
      value,
    }

    // For property operators, split key=value
    if (m.keyword === 'property') {
      const eqIndex = value.indexOf('=')
      if (eqIndex >= 0) {
        operator.propertyKey = value.slice(0, eqIndex)
        operator.propertyValue = stripQuotes(value.slice(eqIndex + 1))
      } else {
        operator.propertyKey = value
      }
    }

    operators.push(operator)
  }

  return { operators, freeText }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strips surrounding double-quotes and unescapes inner escaped quotes.
 */
function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"')
  }
  return value
}
