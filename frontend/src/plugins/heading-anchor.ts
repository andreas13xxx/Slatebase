/**
 * Heading anchor generation utilities for Obsidian-compatible
 * `[[Page#Heading]]` navigation.
 *
 * Anchors are normalized following Obsidian's rules:
 * - Lowercase
 * - Spaces replaced with hyphens
 * - Non-alphanumeric characters removed (except hyphens, underscores, and umlauts äöüß)
 * - Duplicate headings receive numeric suffixes (-1, -2, etc.)
 */

/**
 * Generates a normalized heading anchor from heading text.
 *
 * The result is deterministic: same input always produces same output.
 *
 * @param text - The raw heading text (e.g. "Meine Überschrift!")
 * @returns Normalized anchor string (e.g. "meine-überschrift")
 */
export function generateHeadingAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9äöüß\-_]/g, '')
}

/**
 * Creates a stateful anchor tracker that ensures unique anchors
 * within a single document render pass.
 *
 * Duplicate headings receive numeric suffixes:
 * - First occurrence: `heading`
 * - Second occurrence: `heading-1`
 * - Third occurrence: `heading-2`
 *
 * Call `reset()` between document renders to clear state.
 */
export function createAnchorTracker(): {
  getAnchor: (text: string) => string
  reset: () => void
} {
  const used = new Map<string, number>()

  return {
    getAnchor(text: string): string {
      const base = generateHeadingAnchor(text)
      const count = used.get(base) ?? 0
      used.set(base, count + 1)
      return count === 0 ? base : `${base}-${count}`
    },
    reset() {
      used.clear()
    }
  }
}
