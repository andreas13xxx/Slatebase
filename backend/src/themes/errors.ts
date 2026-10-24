// ─── Obsidian Theme Error Classes ─────────────────────────────────────────────

/** Thrown when a theme cannot be found in the vault. */
export class ThemeNotFoundError extends Error {
  constructor(public readonly themeId: string) {
    super(`Theme "${themeId}" not found`)
    this.name = 'ThemeNotFoundError'
  }
}

/** Thrown when `theme.css` exceeds the maximum allowed size. */
export class ThemeTooLargeError extends Error {
  constructor(public readonly maxSize: number, public readonly actualSize: number) {
    super(`Theme CSS exceeds maximum size of ${maxSize} bytes (actual: ${actualSize})`)
    this.name = 'ThemeTooLargeError'
  }
}

/** Thrown when a theme id contains characters that are unsafe in a folder name. */
export class InvalidThemeIdError extends Error {
  constructor(public readonly themeId: string) {
    super(`Invalid theme id: "${themeId}"`)
    this.name = 'InvalidThemeIdError'
  }
}

export { AppearanceFileInvalidError } from '../shared/appearance-file.js'
