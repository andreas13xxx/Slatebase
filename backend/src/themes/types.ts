// ─── Obsidian Theme Types ─────────────────────────────────────────────────────

/** Subset of Obsidian's theme `manifest.json` that Slatebase reads. */
export interface ThemeManifest {
  /** Display name; falls back to the theme id when the manifest has none. */
  name: string;
  version?: string;
  author?: string;
  authorUrl?: string;
  minAppVersion?: string;
}

/** Manifest fields a caller may supply when saving; every field is optional. */
export type ThemeManifestInput = { [K in keyof ThemeManifest]?: string | undefined };

/** Metadata for a single theme found under `<vault>/.obsidian/themes/<id>/`. */
export interface ThemeMeta {
  /** Folder name, e.g. `Things`. */
  id: string;
  manifest: ThemeManifest;
  /** Byte size of `theme.css`. */
  size: number;
  /** ISO 8601 timestamp of the last write to `theme.css`. */
  updatedAt: string;
  /** Hostnames the CSS loads resources from (`@import` / `url(...)`), sorted. */
  externalHosts: string[];
  /** Whether the CSS has a Style Settings (`/* @settings`) block, i.e. the theme offers options through that plugin. */
  hasStyleSettings: boolean;
}

/**
 * Reads and writes Obsidian themes inside a vault's `.obsidian/` folder.
 *
 * Themes are vault content, not Slatebase data: they live next to the vault's
 * notes (like `.obsidian/plugins/`), travel with backups and Git-Sync, and an
 * Obsidian vault shows its themes without an import step. The active theme is
 * Obsidian's own `cssTheme` field in `.obsidian/appearance.json`.
 *
 * Every method takes the vault's absolute storage path.
 */
export interface IThemeService {
  /** Lists all themes (folders containing a `theme.css`). Missing folder → empty list. */
  listThemes(vaultPath: string): Promise<ThemeMeta[]>;
  /** Whether a theme exists. Cheap (a stat, no CSS read), so it works for themes over the size limit too. */
  themeExists(vaultPath: string, themeId: string): Promise<boolean>;
  /** Loads a theme's CSS and metadata. Returns null if the theme does not exist. */
  loadTheme(vaultPath: string, themeId: string): Promise<{ css: string; meta: ThemeMeta } | null>;
  /**
   * Creates or overwrites a theme. `manifest` defaults to `{ name: themeId }`. An existing theme whose
   * folder name differs only in case is overwritten (the returned `id` is the existing folder's name).
   */
  saveTheme(vaultPath: string, themeId: string, css: string, manifest?: ThemeManifestInput): Promise<ThemeMeta>;
  /** Deletes a theme folder. If it was the active theme, the selection is reset. No-op if missing. */
  deleteTheme(vaultPath: string, themeId: string): Promise<void>;
  /**
   * Returns `cssTheme` from `appearance.json`, or null for the default (empty/missing/unreadable JSON).
   * The value may be the id of a built-in theme (`builtin:obsidian`) that has no folder in the vault.
   */
  getActiveThemeId(vaultPath: string): Promise<string | null>;
  /**
   * Sets (or with null clears) `cssTheme`, preserving all other `appearance.json` fields. A built-in theme id is
   * stored without an existence check; any other id must name an installed theme.
   */
  setActiveThemeId(vaultPath: string, themeId: string | null): Promise<void>;
}
