// Size limits for plugin files, one place for backend and frontend.
//
// Obsidian itself sets no limit that is documented or known. The limits exist to stop abuse, not to
// reject real plugins, so they sit well above what community plugins ship: measured on release
// assets on 2026-10-31, the largest `main.js` was 5.2 MB (Copilot), then Excalidraw 5.1 MB and
// LiveSync 4.6 MB, `styles.css` up to 353 KB. About five times that is allowed.

const MB = 1024 * 1024

export const PLUGIN_LIMITS = {
  /** An uploaded plugin ZIP. */
  maxZipBytes: 50 * MB,
  /** All files of a ZIP after extraction. */
  maxExtractedBytes: 100 * MB,
  /** One plugin file (`main.js`, `styles.css`, `manifest.json`). */
  maxFileBytes: 25 * MB,
  /** One release asset downloaded from the community store. */
  maxAssetBytes: 25 * MB,
  /** All assets of one plugin downloaded from the community store. */
  maxTotalDownloadBytes: 50 * MB,
  /** A plugin's `data.json` and the list of enabled plugins. */
  maxSettingsBytes: 10 * MB,
} as const

/** "25 MB" for messages. */
export function formatPluginLimit(bytes: number): string {
  return `${Math.round((bytes / MB) * 10) / 10} MB`
}
