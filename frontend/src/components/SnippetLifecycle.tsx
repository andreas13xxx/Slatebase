/**
 * SnippetLifecycle — applies a vault's enabled CSS snippets on open and swaps
 * them out on vault switch (Requirement 9.4, 9.5). Renders nothing; mounted
 * once near the app root (inside AppProvider) so it reacts to
 * `state.selectedVaultId` regardless of which page/tab is active.
 */
import { useEffect, useRef } from 'react'
import { useAppContext } from '../state'
import { snippetStore } from '../state/snippetStore'
import { snippetInjector } from '../plugins/appearance/snippet-injector'

export function SnippetLifecycle(): null {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId
  const appliedVaultRef = useRef<string | null>(null)

  useEffect(() => {
    if (!apiClient || !vaultId) return
    if (appliedVaultRef.current === vaultId) return

    let cancelled = false

    async function applyForVault(): Promise<void> {
      // Remove the previous vault's snippets before applying the new vault's
      // (Requirement 9.5) — even if loading the new list fails below.
      snippetInjector.removeAll()

      try {
        const snippets = await snippetStore.listForVault(apiClient!, vaultId!)
        if (cancelled) return

        const enabled = snippets.filter((s) => s.enabled)
        for (const snippet of enabled) {
          const content = await snippetStore.loadContent(apiClient!, vaultId!, snippet.id)
          if (cancelled) return
          snippetInjector.apply(snippet.id, content)
        }
        appliedVaultRef.current = vaultId
      } catch {
        // Snippet application is best-effort cosmetic enhancement — a failed
        // load must never block the vault from opening.
      }
    }

    void applyForVault()

    return () => {
      cancelled = true
    }
  }, [apiClient, vaultId])

  return null
}
