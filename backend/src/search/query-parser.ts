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
 *   [key:value]        — shorthand for property:key=value (also negatable: -[key:value])
 *   line:(a b)         — all terms on the same line
 *   section:(a b)      — all terms in the same section (heading to next heading)
 *   block:(a b)        — all terms in the same block (paragraph)
 *   content:(a b)      — all terms anywhere in the file's content
 *   task:(a b)         — all terms in one task line; task-todo: open, task-done: completed tasks
 *   match-case:<term>  — term matched case-sensitively
 *   ignore-case:<term> — term matched case-insensitively
 *   (text operators can be negated with a leading -)
 *
 * Values can be quoted: `path:"My Folder/**"` or `property:status="in progress"`
 * Unknown `foo:bar` patterns are kept as free-text (not treated as operators).
 *
 * shortcut: a query of only negated text operators lists no files (hits come from positive terms).
 * shortcut: `[key]` (existence only) and `[key:a OR b]` are not parsed; use
 * `property:key` and separate `[key:a]` terms. Upgrade if users ask for them.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Operators that match inside the file's text (they need the content, not just the file list). */
export type TextOperatorType =
  | 'line' | 'section' | 'block' | 'content' | 'task' | 'task-todo' | 'task-done' | 'match-case' | 'ignore-case'

/** A recognized operator type. */
export type OperatorType = 'path' | 'file' | 'tag' | 'property' | TextOperatorType

const TEXT_OPERATORS: ReadonlySet<string> = new Set([
  'line', 'section', 'block', 'content', 'task', 'task-todo', 'task-done', 'match-case', 'ignore-case',
])

/** Whether `type` is an operator that matches inside the file's text. */
export function isTextOperator(type: OperatorType): type is TextOperatorType {
  return TEXT_OPERATORS.has(type)
}

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
  /** For text operators: the terms that must all match within the operator's scope. */
  terms?: string[] | undefined
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
const KNOWN_OPERATORS = new Set<string>(['path', 'file', 'tag', 'property', ...TEXT_OPERATORS])

/**
 * Regex that matches operator tokens in the query string.
 * Groups: (1) negation prefix, (2) keyword, (3) value (quoted, parenthesized or unquoted).
 *
 * An operator must start a word (`inline:x` or `profile:x` are free text).
 * Quoted values: "..." with escaped quotes inside.
 * Parenthesized values: (a b) — several terms for the text operators.
 * Unquoted values: everything up to the next whitespace.
 */
const OPERATOR_REGEX =
  /(?<![^\s])(-?)(path|file|tag|property|line|section|block|content|task-todo|task-done|task|match-case|ignore-case):("(?:[^"\\]|\\.)*"|\([^)]*\)|[^\s]+)/g

/** `[key:value]` property shorthand. Not `[[wikilinks]]` and not `[text](url)` links. */
const BRACKET_PROPERTY_REGEX = /(?<![^\s])(-?)(?<!\[)\[([^[\]:\s][^[\]:]*):([^[\]]*)\](?![([])/g

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

  BRACKET_PROPERTY_REGEX.lastIndex = 0
  while ((match = BRACKET_PROPERTY_REGEX.exec(raw)) !== null) {
    const key = match[2]!.trim()
    const value = match[3]!.trim()
    matches.push({
      fullMatch: match[0],
      negated: match[1] === '-',
      keyword: 'property',
      rawValue: value === '' ? key : `${key}=${value}`,
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

    if (TEXT_OPERATORS.has(m.keyword)) operator.terms = splitTerms(m.rawValue)

    operators.push(operator)
  }

  return { operators, freeText }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Splits a raw operator value into terms: `(a "b c")` gives `a`, `b c`;
 * a bare or quoted value is one term.
 */
function splitTerms(rawValue: string): string[] {
  if (!(rawValue.startsWith('(') && rawValue.endsWith(')'))) {
    const single = stripQuotes(rawValue)
    return single === '' ? [] : [single]
  }
  return [...rawValue.slice(1, -1).matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)]
    .map((t) => (t[1] ?? t[2] ?? '').replace(/\\"/g, '"'))
    .filter((t) => t !== '')
}

/**
 * Strips surrounding double-quotes and unescapes inner escaped quotes.
 */
function stripQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"')
  }
  return value
}
