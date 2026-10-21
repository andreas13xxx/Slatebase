/**
 * ThemeInjector — global (unscoped) CSS injection for the vault's active Obsidian theme.
 *
 * Like the snippet injector, theme CSS is meant to restyle the whole application
 * (`body { … }`, `.theme-dark { … }`), so it is injected raw into <head>. Two
 * differences: there is at most one theme, in a single `<style data-slatebase-theme>`
 * tag; and applying it sets `data-obsidian-theme` on <html>, which switches on
 * `theme-bridge.css` (Slatebase's own tokens then follow the theme's variables).
 *
 * Cascade order is base CSS < theme < snippets, so the theme tag is placed before the
 * first snippet tag if snippets are already present; snippets applied later append after it.
 */

/** Maximum allowed theme CSS size in bytes (3 MB) — mirrors the backend limit. */
const MAX_THEME_CSS_SIZE_BYTES = 3 * 1024 * 1024

const THEME_STYLE_SELECTOR = 'style[data-slatebase-theme]'
const SNIPPET_STYLE_SELECTOR = 'style[data-snippet-id]'
const THEME_MARKER_ATTRIBUTE = 'data-obsidian-theme'

export interface IThemeInjector {
  /** Injects (or replaces) the active theme's CSS and enables the token bridge. Returns false if rejected. */
  apply(themeId: string, css: string): boolean
  /** Removes the theme tag and the bridge marker, restoring the Slatebase default look. */
  remove(): void
  /** Id of the currently applied theme, or null. */
  currentThemeId(): string | null
}

export class ThemeInjector implements IThemeInjector {
  apply(themeId: string, css: string): boolean {
    const byteLength = new TextEncoder().encode(css).length
    if (byteLength > MAX_THEME_CSS_SIZE_BYTES) {
      console.error(`[theme:${themeId}] exceeds maximum size of 3 MB (${byteLength} bytes). Not injected.`)
      return false
    }

    let style = document.head.querySelector<HTMLStyleElement>(THEME_STYLE_SELECTOR)
    if (style === null) {
      style = document.createElement('style')
      const firstSnippet = document.head.querySelector(SNIPPET_STYLE_SELECTOR)
      document.head.insertBefore(style, firstSnippet)
    }
    style.setAttribute('data-slatebase-theme', themeId)
    style.textContent = css
    document.documentElement.setAttribute(THEME_MARKER_ATTRIBUTE, themeId)
    return true
  }

  remove(): void {
    document.head.querySelector(THEME_STYLE_SELECTOR)?.remove()
    document.documentElement.removeAttribute(THEME_MARKER_ATTRIBUTE)
  }

  currentThemeId(): string | null {
    return document.head.querySelector(THEME_STYLE_SELECTOR)?.getAttribute('data-slatebase-theme') ?? null
  }
}

/** Shared singleton — the active theme is a single, app-wide concern. */
export const themeInjector: IThemeInjector = new ThemeInjector()
