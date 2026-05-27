/**
 * Filename validation and normalization utilities for the FileExplorer.
 * Used by InlineInput (new file, rename) to validate user input client-side.
 */

/** Default maximum filename length (including .md extension). */
const DEFAULT_MAX_LENGTH = 128

/**
 * Validates a filename against invalid characters and length constraints.
 * Returns null if valid, or an error message string if invalid.
 *
 * Rejects:
 * - Path separators (/ or \)
 * - Null bytes (\0)
 * - Whitespace-only names
 * - Names exceeding maxLength (default 128, including .md extension)
 */
export function validateFileName(name: string, maxLength: number = DEFAULT_MAX_LENGTH): string | null {
  if (name.trim().length === 0) {
    return 'Dateiname darf nicht leer oder nur aus Leerzeichen bestehen'
  }

  if (name.includes('/') || name.includes('\\')) {
    return 'Dateiname darf keine Pfad-Separatoren (/ oder \\) enthalten'
  }

  if (name.includes('\0')) {
    return 'Dateiname enthält ungültige Zeichen'
  }

  if (name.length > maxLength) {
    return `Dateiname darf maximal ${maxLength} Zeichen lang sein`
  }

  return null
}

/**
 * Normalizes a filename by auto-appending .md if missing.
 * If the name already ends with .md (case-insensitive), does NOT append a second .md.
 */
export function normalizeFileName(name: string): string {
  if (name.toLowerCase().endsWith('.md')) {
    return name
  }
  return name + '.md'
}

/**
 * Computes the selection range for an inline rename input.
 * For files: selects name without extension (0 to name.length - extension.length).
 * For folders: selects the entire name (0 to name.length).
 */
export function getSelectionRange(name: string, isFolder: boolean): [number, number] {
  if (isFolder) {
    return [0, name.length]
  }

  const lastDot = name.lastIndexOf('.')
  if (lastDot <= 0) {
    // No extension or dot at position 0 (hidden file like ".gitignore")
    return [0, name.length]
  }

  return [0, lastDot]
}
