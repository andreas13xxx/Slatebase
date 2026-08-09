/**
 * Keeps Obsidian's marker classes on `document.body` in sync with our state.
 *
 * Obsidian puts its current theme and platform on the body element, and both
 * plugin JavaScript and plugin `styles.css` depend on it:
 *
 * ```css
 * .theme-dark .my-plugin-panel { background: #222; }
 * ```
 * ```js
 * if (document.body.classList.contains('theme-dark')) { … }
 * ```
 *
 * Slatebase expresses its theme as `data-theme` on `<html>` (`light` | `dark` |
 * `system`) instead. Nothing was translating between the two, so every dark-mode
 * rule shipped by a plugin was dead CSS and every runtime theme check silently
 * took the light branch — including Excalidraw's, which is why its canvas stayed
 * white on a dark vault.
 *
 * Platform classes have the same problem: `.is-mobile` guards the touch-friendly
 * layout in a lot of plugin stylesheets, and `.mod-macos` / `.mod-windows` gate
 * hotkey hints. They derive from {@link detectPlatform}, so they agree with what
 * `Platform` reports to plugins rather than being a second, divergent guess.
 *
 * The theme is re-evaluated on `data-theme` changes and — while the user is on
 * `system` — on OS-level scheme changes, because the resolved theme differs from
 * the stored preference in exactly that case.
 *
 * @module body-classes
 */

import { detectPlatform, readPlatformEnvironment } from './platform-detection'

/** The two theme classes, so switching one always removes the other. */
const THEME_CLASSES = ['theme-light', 'theme-dark'] as const

/**
 * Resolve the theme actually being displayed.
 *
 * `data-theme="system"` (and a missing attribute) defer to the OS, which is why
 * this cannot just mirror the attribute value.
 */
export function resolveActiveTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return 'dark'
  if (attr === 'light') return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Apply the `theme-light`/`theme-dark` pair for the currently active theme. */
export function syncThemeBodyClass(): void {
  const theme = resolveActiveTheme()
  document.body.classList.remove(...THEME_CLASSES)
  document.body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light')
}

/**
 * Apply the platform marker classes.
 *
 * Set once: unlike the theme, none of these can change without a reload — they
 * describe the device, not the window (see platform-detection).
 */
function applyPlatformBodyClasses(): void {
  const platform = detectPlatform(readPlatformEnvironment())
  const body = document.body
  body.classList.toggle('is-mobile', platform.isMobile)
  body.classList.toggle('is-phone', platform.isPhone)
  body.classList.toggle('is-tablet', platform.isTablet)
  body.classList.toggle('mod-macos', platform.isMacOS)
  body.classList.toggle('mod-windows', platform.isWin)
  body.classList.toggle('mod-linux', platform.isLinux)
  body.classList.toggle('mod-ios', platform.isIosOS)
  body.classList.toggle('mod-android', platform.isAndroidOS)
}

/** Guard so repeated calls from multiple entry points are harmless. */
let installed = false

/**
 * Start syncing Obsidian's body marker classes. Idempotent.
 *
 * Called from {@link installObsidianGlobals} so the classes are in place before
 * any plugin bundle evaluates — a plugin that reads the theme in its module
 * body, not in `onload()`, would otherwise see the light default.
 */
export function installObsidianBodyClasses(): void {
  if (installed || typeof document === 'undefined') return
  installed = true

  applyPlatformBodyClasses()
  syncThemeBodyClass()

  // `data-theme` flips when the user changes their preference.
  new MutationObserver(syncThemeBodyClass).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })

  // The OS scheme only matters while the preference is `system`, but subscribing
  // unconditionally is cheaper than tearing the listener down on every change —
  // syncThemeBodyClass() re-reads the attribute and is a no-op otherwise.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', syncThemeBodyClass)
}
