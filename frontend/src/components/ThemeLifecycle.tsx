/**
 * ThemeLifecycle — applies the open vault's active Obsidian theme and keeps it in sync.
 * Renders nothing; mounted once near the app root (inside AppProvider), next to
 * SnippetLifecycle.
 *
 * The selection lives in the vault (`.obsidian/appearance.json`), so it is the same for
 * everyone who opens the vault. It is re-read when the vault changes and whenever the
 * server reports a change to `appearance.json` or a theme file (`vault:change`).
 *
 * A failed request is "unknown", never "gone": the theme that is currently applied stays.
 * Only an explicit answer ends it — no active theme, or `THEME_NOT_FOUND` for the selected one.
 */
import { useEffect, useRef } from 'react'
import { useAppContext } from '../state'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { isBuiltinThemeId } from '../plugins/appearance/builtin-themes'
import { themeInjector } from '../plugins/appearance/theme-injector'

const APPEARANCE_PATH = '.obsidian/appearance.json'
const THEMES_PREFIX = '.obsidian/themes/'

function isThemeRelatedPath(path: string): boolean {
  return path === APPEARANCE_PATH || path.startsWith(THEMES_PREFIX)
}

function isThemeNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'THEME_NOT_FOUND'
}

export function ThemeLifecycle(): null {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId
  // The vault whose theme is currently applied. The effect re-runs when only `apiClient` changes
  // (re-auth, provider re-creation); that must not clear the theme of the same vault.
  const appliedVaultRef = useRef<string | null>(null)

  useEffect(() => {
    if (!apiClient || !vaultId) return

    let cancelled = false
    // A slow earlier response must never overwrite a newer one.
    let generation = 0

    async function sync(): Promise<void> {
      const mine = ++generation
      try {
        const activeId = await apiClient!.getActiveTheme(vaultId!)
        if (cancelled || mine !== generation) return
        if (activeId === null) {
          themeInjector.remove()
          return
        }
        if (isBuiltinThemeId(activeId)) {
          themeInjector.applyBuiltin(activeId)
          return
        }
        const { css } = await apiClient!.loadTheme(vaultId!, activeId)
        if (cancelled || mine !== generation) return
        themeInjector.apply(activeId, css)
      } catch (error) {
        if (cancelled || mine !== generation) return
        if (isThemeNotFound(error)) {
          themeInjector.remove()
          return
        }
        // Cosmetic and best-effort: keep whatever is applied, never block the vault from opening.
        console.warn('[theme] could not load the active theme; keeping the current look', error)
      }
    }

    // A different vault has its own theme (or none): clear the previous one first so it
    // cannot linger if the new vault's request fails. The same vault keeps its theme while
    // it is re-read — a failed request must not undo it.
    if (appliedVaultRef.current !== vaultId) {
      themeInjector.remove()
      appliedVaultRef.current = vaultId
    }
    void sync()

    const unsubscribe = onRealtimeVaultChange((event) => {
      if (event.vaultId === vaultId && isThemeRelatedPath(event.path)) void sync()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [apiClient, vaultId])

  return null
}
