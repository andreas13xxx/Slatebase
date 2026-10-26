/**
 * Themes that ship with Slatebase: selectable per vault like a vault theme, but they have no folder under
 * `.obsidian/themes/` and no CSS in the vault. Their CSS is part of the frontend bundle
 * (`builtin/<name>.css`), every rule gated on `:root[data-obsidian-theme="<id>"]`.
 *
 * The ids are what the backend stores as `cssTheme` in `appearance.json`; they contain a colon, which no installed
 * theme id can (backend `isValidThemeId`), so a built-in id never collides with a vault theme.
 */

export interface BuiltinTheme {
  /** Value stored as `cssTheme` and set as `data-obsidian-theme`. */
  id: string
  /** Label in the theme list (German UI). */
  name: string
  /** One-line description shown next to the label. */
  description: string
}

/** Obsidian's default look (reference: Obsidian 1.14.5). Keep in sync with the backend's `BUILTIN_OBSIDIAN_THEME_ID`. */
export const BUILTIN_OBSIDIAN_THEME_ID = 'builtin:obsidian'

/** All built-in themes, in the order they are listed after "Slatebase (Standard)". */
export const BUILTIN_THEMES: readonly BuiltinTheme[] = [
  {
    id: BUILTIN_OBSIDIAN_THEME_ID,
    name: 'Obsidian (Standard)',
    description: 'Optik des Obsidian-Standard-Themes',
  },
]

/** True for the id of a theme that ships with Slatebase. */
export function isBuiltinThemeId(id: string | null | undefined): id is string {
  return id !== null && id !== undefined && BUILTIN_THEMES.some((theme) => theme.id === id)
}
