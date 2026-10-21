// ─── Themes Module Barrel Export ──────────────────────────────────────────────

export { ThemeService } from './theme-service.js'
export { ThemeNotFoundError, ThemeTooLargeError, InvalidThemeIdError, AppearanceFileInvalidError } from './errors.js'
export {
  MAX_THEME_CSS_SIZE,
  isValidThemeId,
  toThemeId,
  themeIdSchema,
  saveThemeSchema,
  setActiveThemeSchema,
  normalizeManifest,
  extractExternalHosts,
} from './validation.js'
export type { IThemeService, ThemeManifest, ThemeManifestInput, ThemeMeta } from './types.js'
export type { SaveThemeInput } from './validation.js'
