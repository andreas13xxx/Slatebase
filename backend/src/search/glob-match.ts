/**
 * Minimal glob matching for the `path:` search operator.
 *
 * Supports:
 *   `*`  — any characters within a single path segment (does not cross `/`)
 *   `**` — any number of path segments (crosses `/`)
 *   `?`  — a single character (does not cross `/`)
 *
 * Matching is case-insensitive (vault paths are platform-agnostic).
 * No external dependency — simple regex-translation implementation.
 */

/**
 * Tests whether a file path matches a glob pattern.
 * @param filePath - Relative file path (forward slashes)
 * @param pattern - Glob pattern to match against
 * @returns true if the path matches the pattern
 */
export function globMatch(filePath: string, pattern: string): boolean {
  const regex = globToRegex(pattern)
  return regex.test(filePath)
}

/**
 * Converts a glob pattern to a RegExp.
 * Case-insensitive, anchored to full string.
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = ''
  let i = 0

  while (i < pattern.length) {
    const char = pattern[i]!

    if (char === '*') {
      // Check for **
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        // ** matches any number of path segments
        // Consume optional trailing /
        if (i + 2 < pattern.length && pattern[i + 2] === '/') {
          regexStr += '(?:.+/)?'
          i += 3
        } else {
          regexStr += '.*'
          i += 2
        }
      } else {
        // * matches anything except /
        regexStr += '[^/]*'
        i++
      }
    } else if (char === '?') {
      // ? matches a single non-/ character
      regexStr += '[^/]'
      i++
    } else if (char === '/') {
      regexStr += '/'
      i++
    } else {
      // Escape regex special characters
      regexStr += escapeRegexChar(char)
      i++
    }
  }

  return new RegExp(`^${regexStr}$`, 'i')
}

/** Escapes a single character if it has special meaning in regex. */
function escapeRegexChar(char: string): string {
  if ('.+^${}()|[]\\'.includes(char)) {
    return `\\${char}`
  }
  return char
}
