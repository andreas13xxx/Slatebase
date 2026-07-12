/**
 * Property extraction utility for the link-index module.
 *
 * Extracts YAML frontmatter properties from markdown content.
 * Uses a simple regex/line-based approach (no external YAML library dependency).
 *
 * Handles:
 * - Simple string values: `key: value`
 * - Numeric values (converted to string): `priority: 3`
 * - Inline YAML arrays: `tags: [a, b, c]`
 * - Multi-line YAML arrays (dash syntax): `tags:\n  - a\n  - b`
 * - Skips complex nested objects (only top-level keys)
 * - Returns empty object for missing/invalid frontmatter (never throws)
 */

/**
 * Extracts properties from YAML frontmatter in markdown content.
 *
 * @param content - The full markdown document content
 * @returns Record mapping property keys to arrays of string values.
 *          Returns empty object if no frontmatter is present or if parsing fails.
 */
export function extractProperties(content: string): Record<string, string[]> {
  const frontmatter = extractFrontmatterBlock(content)
  if (frontmatter === null) {
    return {}
  }

  try {
    return parseFrontmatterProperties(frontmatter)
  } catch {
    // Invalid YAML — return empty object (no throw)
    return {}
  }
}

/**
 * Extracts the raw frontmatter string between `---` delimiters.
 * Returns null if no valid frontmatter block is found.
 */
function extractFrontmatterBlock(content: string): string | null {
  // Frontmatter must start at the very beginning of the document
  if (!content.startsWith('---')) {
    return null
  }

  // Find the closing delimiter
  const closingIndex = content.indexOf('\n---', 3)
  if (closingIndex === -1) {
    return null
  }

  const raw = content.slice(4, closingIndex)
  if (raw.trim() === '') {
    return null
  }

  return raw
}

/**
 * Parses frontmatter YAML into a record of string arrays.
 * Only handles top-level scalar values and simple arrays.
 */
function parseFrontmatterProperties(frontmatter: string): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  const lines = frontmatter.split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]!

    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++
      continue
    }

    // Match a top-level key (no leading whitespace)
    const keyMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/)
    if (!keyMatch) {
      i++
      continue
    }

    const key = keyMatch[1]!
    const valueStr = keyMatch[2]!.trim()

    // Case 1: Inline array `[a, b, c]`
    if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
      const inner = valueStr.slice(1, -1)
      const values = parseInlineArray(inner)
      if (values.length > 0) {
        result[key] = values
      }
      i++
      continue
    }

    // Case 2: Empty value followed by dash-list items (multi-line array)
    if (valueStr === '') {
      const arrayValues: string[] = []
      let j = i + 1
      while (j < lines.length) {
        const nextLine = lines[j]!
        const dashMatch = nextLine.match(/^\s+-\s+(.+)$/)
        if (dashMatch) {
          const val = dashMatch[1]!.trim()
          arrayValues.push(stripQuotes(val))
          j++
        } else if (nextLine.trim() === '') {
          // Empty line within array is acceptable
          j++
        } else {
          break
        }
      }

      if (arrayValues.length > 0) {
        result[key] = arrayValues
        i = j
        continue
      }

      // No dash items → skip this key (nested object or truly empty)
      i++
      continue
    }

    // Case 3: Simple scalar value (string, number, boolean, date, etc.)
    // Skip values that look like nested objects (contains `{` or starts with `|`/`>`)
    if (valueStr.startsWith('{') || valueStr.startsWith('|') || valueStr.startsWith('>')) {
      i++
      continue
    }

    const scalarValue = stripQuotes(valueStr)
    if (scalarValue !== '') {
      result[key] = [scalarValue]
    }

    i++
  }

  return result
}

/**
 * Parses an inline YAML array content (without brackets).
 * E.g. `"a, b, c"` → `["a", "b", "c"]`
 */
function parseInlineArray(inner: string): string[] {
  if (inner.trim() === '') return []

  return inner
    .split(',')
    .map((item) => stripQuotes(item.trim()))
    .filter((item) => item !== '')
}

/**
 * Strips surrounding quotes (single or double) from a string value.
 */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1)
    }
  }
  return value
}
