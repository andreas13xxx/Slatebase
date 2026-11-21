/**
 * Finds the real tab-strip element (`TabBar.tsx`) that belongs to a leaf.
 *
 * Backs `leaf.tabHeaderEl` / `tabHeaderInnerTitleEl` / `tabHeaderInnerIconEl`,
 * which plugins use to decorate a tab (badges, icons, drag handlers). The tab
 * strip is React-rendered, so nothing is cached: every read looks the element
 * up again, and a tab that is not on screen yields a detached placeholder
 * instead of `null` (Obsidian's leaf always has these elements).
 *
 * Tabs carry their file path in `aria-label` (`__view::<type>` for plugin view
 * tabs). When the same path is open in several panes, the active tab wins.
 *
 * @module tab-header-dom
 */

const TAB_SELECTOR = '.tab-bar-tab'

/** Real tab element for a tab path, or `null` when no such tab is mounted. */
export function findTabHeaderEl(tabPath: string | null): HTMLElement | null {
  if (!tabPath || typeof document === 'undefined') return null
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(TAB_SELECTOR))
    .filter((el) => el.getAttribute('aria-label') === tabPath)
  return candidates.find((el) => el.classList.contains('tab-bar-tab--active')) ?? candidates[0] ?? null
}

/** Inner title element of a tab (its label span). */
export function findTabTitleEl(tab: HTMLElement): HTMLElement | null {
  return tab.querySelector<HTMLElement>('.tab-bar-tab-label')
}

/** Inner icon element of a tab. */
export function findTabIconEl(tab: HTMLElement): HTMLElement | null {
  return tab.querySelector<HTMLElement>('.tab-bar-tab-icon')
}
