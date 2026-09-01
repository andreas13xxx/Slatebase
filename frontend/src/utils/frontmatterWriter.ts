/**
 * Frontmatter writer utility for the Properties Editor.
 *
 * Provides functions to locate, serialize, and apply frontmatter changes
 * to a Markdown document. The serializer produces Obsidian-compatible YAML
 * without depending on an external YAML library for output.
 *
 * Rules:
 * - Scalars: `key: value` (strings unquoted unless they contain special chars)
 * - Arrays (≤3 items): inline `[a, b, c]`
 * - Arrays (>3 items): multi-line dash syntax
 * - Booleans: `true`/`false` (lowercase)
 * - Dates: ISO string unquoted
 * - null: kept as an empty value (`key:`) — a property whose value the user
 *   left blank must survive a round-trip, not be silently deleted from the file
 * - undefined: key omitted entirely
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Result of locating a frontmatter block in a document. */
export interface FrontmatterLocation {
  /** Byte offset of the first character after the opening `---\n` delimiter. */
  from: number
  /** Byte offset of the `\n` before the closing `---` delimiter. */
  to: number
  /** The raw YAML text between the delimiters (without delimiters). */
  raw: string
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Locates the frontmatter block boundaries in document content.
 * Returns null if no valid frontmatter block exists.
 */
export function locateFrontmatterBlock(content: string): FrontmatterLocation | null {
  // Normalize line endings for consistent matching
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Must start with ---
  if (!normalized.startsWith('---')) return null

  // Find end of opening delimiter line
  const firstNewline = normalized.indexOf('\n', 3)
  if (firstNewline === -1) return null

  // Only whitespace allowed after the opening ---
  const afterDashes = normalized.slice(3, firstNewline).trim()
  if (afterDashes !== '') return null

  // Find closing delimiter
  const closingIndex = normalized.indexOf('\n---', firstNewline)
  if (closingIndex === -1) return null

  // Verify the closing --- is on its own line (only whitespace after)
  const afterClosing = normalized.indexOf('\n', closingIndex + 4)
  if (afterClosing !== -1) {
    const trailingOnClosingLine = normalized.slice(closingIndex + 4, afterClosing).trim()
    if (trailingOnClosingLine !== '') return null
  } else {
    // Closing is at end of file
    const trailingOnClosingLine = normalized.slice(closingIndex + 4).trim()
    if (trailingOnClosingLine !== '') return null
  }

  const from = firstNewline + 1
  const to = closingIndex

  return {
    from,
    to,
    raw: normalized.slice(from, to),
  }
}

/**
 * Serializes a frontmatter data object to YAML text (without --- delimiters).
 * Preserves key order from `originalKeyOrder` when possible.
 *
 * @param data - The frontmatter object to serialize
 * @param originalKeyOrder - Optional array of keys in their original order
 * @returns YAML string (without delimiters), or empty string if data is empty
 */
export function serializeFrontmatter(
  data: Record<string, unknown>,
  originalKeyOrder?: string[],
): string {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return ''

  // Sort entries by original key order if provided
  const orderedEntries = originalKeyOrder
    ? sortByKeyOrder(entries, originalKeyOrder)
    : entries

  const lines: string[] = []

  for (const [key, value] of orderedEntries) {
    // An empty property (`status:` with nothing after it) parses as null. It is
    // a property the user deliberately left blank, so write the bare key back
    // instead of dropping the line — dropping it deleted such properties from
    // the file on every unrelated commit.
    if (value === null) {
      lines.push(`${key}:`)
      continue
    }

    const serialized = serializeValue(value)
    if (serialized === null) continue // skip undefined

    if (serialized.multiline) {
      lines.push(`${key}:`)
      for (const item of serialized.lines) {
        lines.push(`  - ${quoteIfNeeded(item)}`)
      }
    } else {
      lines.push(`${key}: ${serialized.text}`)
    }
  }

  return lines.join('\n')
}

/**
 * Generates the full document content with the updated frontmatter block.
 * If no frontmatter exists and `data` is non-empty, prepends a new block.
 * If data is empty (all null/undefined), removes the frontmatter block entirely.
 */
export function applyFrontmatterChange(
  content: string,
  data: Record<string, unknown>,
  originalKeyOrder?: string[],
): string {
  const yaml = serializeFrontmatter(data, originalKeyOrder)
  const location = locateFrontmatterBlock(content)

  if (yaml === '') {
    // No properties to write — remove frontmatter block if it exists
    if (location) {
      // Remove the entire block including delimiters
      const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      const blockEnd = normalized.indexOf('\n', location.to + 1)
      const afterBlock = blockEnd === -1 ? '' : normalized.slice(blockEnd + 1)
      return afterBlock
    }
    return content
  }

  if (location) {
    // Replace existing frontmatter content
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const before = normalized.slice(0, location.from)
    // `location.to` is the index of the newline *before* the closing `---`, so
    // `after` already starts with it — adding another would grow a blank line
    // inside the block on every write.
    const after = normalized.slice(location.to)
    return `${before}${yaml}${after}`
  }

  // No existing frontmatter — prepend new block
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return `---\n${yaml}\n---\n${normalized}`
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

type SerializedValue = {
  multiline: false
  text: string
} | {
  multiline: true
  lines: string[]
}

function serializeValue(value: unknown): SerializedValue | null {
  // null is handled by the caller (written as an empty value); only undefined
  // means "no line at all".
  if (value === null || value === undefined) return null

  if (typeof value === 'boolean') {
    return { multiline: false, text: value ? 'true' : 'false' }
  }

  if (typeof value === 'number') {
    return { multiline: false, text: String(value) }
  }

  if (typeof value === 'string') {
    return { multiline: false, text: quoteIfNeeded(value) }
  }

  // A Date can reach here from a plugin or a YAML 1.1 parser; JSON.stringify
  // would wrap it in its own quotes below, so handle it before the object case.
  if (value instanceof Date) {
    return {
      multiline: false,
      text: Number.isNaN(value.getTime()) ? '' : value.toISOString(),
    }
  }

  if (Array.isArray(value)) {
    const items = value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item))

    if (items.length === 0) return { multiline: false, text: '[]' }

    // Short arrays inline, long arrays multiline
    if (items.length <= 3) {
      const inlineItems = items.map((item) => quoteIfNeeded(item)).join(', ')
      return { multiline: false, text: `[${inlineItems}]` }
    }

    return { multiline: true, lines: items }
  }

  // Objects — serialize as inline JSON (not a common case for frontmatter)
  if (typeof value === 'object') {
    return { multiline: false, text: JSON.stringify(value) }
  }

  return { multiline: false, text: String(value) }
}

/**
 * Matches an ISO date or date-time, with optional seconds and zone offset.
 * The YAML core schema resolves these to plain strings, so they need no quotes
 * — and leaving them bare keeps the file matching what Obsidian and
 * hand-written frontmatter use, instead of re-quoting every date on each save.
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

/**
 * Quotes a string value if it contains YAML-special characters.
 * Otherwise returns it unquoted.
 */
function quoteIfNeeded(value: string): string {
  if (value === '') return '""'
  if (value === 'true' || value === 'false' || value === 'null') return `"${value}"`

  // Check if it looks like a number
  if (/^-?\d+(\.\d+)?$/.test(value)) return `"${value}"`

  // Dates and date-times are safe bare, despite the `:` in the time part
  if (ISO_DATE_RE.test(value)) return value

  // Check for YAML-special characters that require quoting
  if (/[:{}[\],&#*?|>!%@`'"\\\n\r\t]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
    // Escape internal quotes and wrap. Line breaks and tabs have to become
    // escape sequences too: a raw newline inside a double-quoted scalar
    // continues that scalar onto the next line, which turns the remaining keys
    // into part of the string and the block as a whole into invalid YAML — at
    // which point the properties editor can no longer read *any* property.
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
    return `"${escaped}"`
  }

  return value
}

/**
 * Sorts entries by their original key order, with new keys appended at the end.
 */
function sortByKeyOrder(
  entries: Array<[string, unknown]>,
  originalOrder: string[],
): Array<[string, unknown]> {
  const orderMap = new Map<string, number>()
  for (let i = 0; i < originalOrder.length; i++) {
    orderMap.set(originalOrder[i]!, i)
  }

  return [...entries].sort((a, b) => {
    const aIdx = orderMap.get(a[0]) ?? Number.MAX_SAFE_INTEGER
    const bIdx = orderMap.get(b[0]) ?? Number.MAX_SAFE_INTEGER
    return aIdx - bIdx
  })
}
