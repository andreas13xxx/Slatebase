/**
 * Canvas file-reference extractor for the link index.
 * Parses .canvas JSON and extracts file paths from file-type nodes.
 * Used by LinkIndexService to index canvas→file links.
 */

/**
 * Extracts file references from a .canvas JSON string.
 * Returns an array of vault-relative file paths referenced by file-nodes.
 *
 * @param content - Raw JSON content of the .canvas file
 * @returns Array of file paths (from file-type nodes)
 */
export function extractCanvasFileRefs(content: string): string[] {
  try {
    const parsed = JSON.parse(content)

    if (parsed === null || typeof parsed !== 'object') return []
    if (!Array.isArray(parsed.nodes)) return []

    const refs: string[] = []

    for (const node of parsed.nodes) {
      if (node === null || typeof node !== 'object') continue
      if (node.type !== 'file') continue
      if (typeof node.file !== 'string' || node.file.length === 0) continue
      refs.push(node.file)
    }

    return refs
  } catch {
    // Invalid JSON — return empty array
    return []
  }
}
