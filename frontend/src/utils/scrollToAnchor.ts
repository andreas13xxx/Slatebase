/**
 * DOM scrolling to a heading or block anchor in a rendered note (reading view). Shared by the
 * wikilink click handlers in `ViewMode` and the deep-link / anchor-jump machinery.
 *
 * @module utils/scrollToAnchor
 */

/**
 * Scrolls to a heading anchor element on the current page.
 * Generates the normalized anchor from the heading text and scrolls to the matching element.
 * Validates: Requirements 2.4, 2.5
 *
 * @returns Whether the anchor element exists (so a caller waiting for a render can retry).
 */
export function scrollToHeadingAnchor(heading: string): boolean {
  // Generate the anchor ID using the same normalization as createAnchorTracker
  const anchorId = heading
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9äöüß\-_]/g, '')

  const element = document.getElementById(anchorId)
  if (!element) return false
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}

/**
 * Scrolls to a block anchor element on the current page.
 * Block anchors have IDs in the format `^{block-id}`.
 * Validates: Requirements 20.1, 20.5
 *
 * @returns Whether the anchor element exists.
 */
export function scrollToBlockAnchor(blockId: string): boolean {
  const element = document.getElementById(`^${blockId}`)
  if (!element) return false
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}
