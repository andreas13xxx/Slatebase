/**
 * "The page's CSS changed" signal for the appearance injectors (theme and snippets).
 *
 * Obsidian emits the workspace event `css-change` when the theme or the loaded CSS changes; plugins re-read what they
 * derive from it. Style Settings, for one, parses the `@settings` blocks of every stylesheet only at start and on this
 * event, so without it its settings stay those of the previous theme. The plugin event bridge forwards
 * {@link CSS_CHANGE_EVENT} as `css-change`.
 *
 * Kept in its own module so the injectors do not import from `plugins/compat/`.
 */

/** Window event dispatched after the theme or a snippet was applied, replaced or removed. */
export const CSS_CHANGE_EVENT = 'slatebase:css-change'

let pending = false

/**
 * Announces a CSS change. Several changes in the same turn (a vault switch removes and applies a theme and a handful of
 * snippets) are coalesced into one event, so listeners that re-parse every stylesheet do that once.
 */
export function notifyCssChange(): void {
  if (pending) return
  pending = true
  queueMicrotask(() => {
    pending = false
    window.dispatchEvent(new Event(CSS_CHANGE_EVENT))
  })
}
