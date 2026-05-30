import { parse as parseYaml } from 'yaml'

/** Result of parsing YAML frontmatter from markdown content */
export interface ParseFrontmatterResult {
  /** Parsed frontmatter data, or null if no/empty frontmatter or parse error */
  data: Record<string, unknown> | null
  /** Error message if YAML parsing failed, or null on success */
  parseError: string | null
  /** Raw frontmatter text (without delimiters), or null if no frontmatter found */
  rawFrontmatter: string | null
}

/**
 * Extract and parse YAML frontmatter from markdown content.
 *
 * Frontmatter must start on the first line with `---`, followed by YAML content,
 * and closed with a `---` line.
 *
 * @param content - The full markdown document content
 * @returns Parsed frontmatter data, parse error, and raw frontmatter text
 */
export function parseFrontmatter(content: string): ParseFrontmatterResult {
  // Frontmatter must start at the very beginning of the document
  if (!content.startsWith('---')) {
    return { data: null, parseError: null, rawFrontmatter: null }
  }

  // Find the closing delimiter
  const closingIndex = content.indexOf('\n---', 3)
  if (closingIndex === -1) {
    return { data: null, parseError: null, rawFrontmatter: null }
  }

  // Extract the raw frontmatter between the delimiters
  const rawFrontmatter = content.slice(4, closingIndex)

  // Handle empty frontmatter (just `---\n---`)
  if (rawFrontmatter.trim() === '') {
    return { data: null, parseError: null, rawFrontmatter: '' }
  }

  // Attempt to parse the YAML
  try {
    const parsed = parseYaml(rawFrontmatter)

    // If parsing returns a non-object (e.g. a scalar), treat as no data
    if (parsed === null || parsed === undefined || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: null, parseError: null, rawFrontmatter }
    }

    return { data: parsed as Record<string, unknown>, parseError: null, rawFrontmatter }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown YAML parse error'
    return { data: null, parseError: message, rawFrontmatter }
  }
}
