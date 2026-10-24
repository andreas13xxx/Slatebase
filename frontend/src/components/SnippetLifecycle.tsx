/**
 * SnippetLifecycle — applies a vault's enabled CSS snippets on open and swaps
 * them out on vault switch (Requirement 9.4, 9.5). Renders nothing; mounted
 * once near the app root (inside AppProvider) so it reacts to
 * `state.selectedVaultId` regardless of which page/tab is active.
 *
 * Snippets live in the vault (`.obsidian/snippets/`, enabled ones in
 * `.obsidian/appearance.json`), so they are re-read when the server reports a change
 * to one of those paths (`vault:change`) — e.g. from another user, tab or Obsidian sync.
 */
import { useEffect, useRef } from 'react'
import { useAppContext } from '../state'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { snippetStore } from '../state/snippetStore'
import { snippetInjector } from '../plugins/appearance/snippet-injector'

const APPEARANCE_PATH = '.obsidian/appearance.json'
const SNIPPETS_PREFIX = '.obsidian/snippets/'

function isSnippetRelatedPath(path: string): boolean {
  return path === APPEARANCE_PATH || path.startsWith(SNIPPETS_PREFIX)
}

export function SnippetLifecycle(): null {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId
  const appliedVaultRef = useRef<string | null>(null)

  useEffect(() => {
    if (!apiClient || !vaultId) return

    let cancelled = false
    // A slow earlier response must never overwrite a newer one.
    let generation = 0

    async function applyForVault(): Promise<void> {
      const mine = ++generation
      try {
        const snippets = await snippetStore.listForVault(apiClient!, vaultId!)
        if (cancelled || mine !== generation) return

        const enabled = snippets.filter((s) => s.enabled)
        const contents: Array<{ id: string; css: string }> = []
        for (const snippet of enabled) {
          const css = await snippetStore.loadContent(apiClient!, vaultId!, snippet.id)
          if (cancelled || mine !== generation) return
          contents.push({ id: snippet.id, css })
        }

        // Swap only once everything has loaded, so a re-read never leaves the UI half-styled.
        snippetInjector.removeAll()
        for (const { id, css } of contents) snippetInjector.apply(id, css)
        appliedVaultRef.current = vaultId
      } catch {
        // Snippet application is best-effort cosmetic enhancement — a failed
        // load must never block the vault from opening, and the snippets that
        // are currently applied stay ("unknown", not "gone").
      }
    }

    if (appliedVaultRef.current !== vaultId) {
      // Remove the previous vault's snippets before applying the new vault's
      // (Requirement 9.5) — even if loading the new list fails below.
      snippetInjector.removeAll()
      void applyForVault()
    }

    const unsubscribe = onRealtimeVaultChange((event) => {
      if (event.vaultId === vaultId && isSnippetRelatedPath(event.path)) void applyForVault()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [apiClient, vaultId])

  return null
}
