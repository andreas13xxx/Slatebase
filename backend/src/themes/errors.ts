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

/**
 * Thrown when `.obsidian/appearance.json` exists but is not a JSON object.
 * The file is never overwritten in that case — it may be mid-sync or hand-edited.
 */
export class AppearanceFileInvalidError extends Error {
  constructor() {
    super('.obsidian/appearance.json is not a valid JSON object; leaving it untouched')
    this.name = 'AppearanceFileInvalidError'
  }
}
