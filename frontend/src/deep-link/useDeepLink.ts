import { useEffect, useRef, useState, type Dispatch } from 'react'
import type { IApiClient } from '../api'
import type { AppAction } from '../types'
import type { TabAction } from '../state/tabState'
import { generateTabId } from '../state/tabState'
import { add as addRecentFile } from '../state/recentFilesStore'
import { requestAnchorJump } from '../state/anchorJumpBridge'
import { showToast } from '../components/ToastNotification'
import { useTranslation } from '../i18n'
import { resolveVaultRef, type DeepLinkTarget } from './deepLink'
import { consumeInvalidDeepLink } from './captureDeepLink'
import { consumePendingDeepLink } from './pendingDeepLink'

interface UseDeepLinkOptions {
  vaults: ReadonlyArray<{ id: string; name: string }>
  selectedVaultId: string | null
  dispatch: Dispatch<AppAction>
  tabDispatch: Dispatch<TabAction>
  apiClient: IApiClient
}

/**
 * Opens the deep link the user arrived with (`/open?vault=…&file=…`), once the signed-in app is up.
 *
 * Ordering matters: call this AFTER the vault-switch effect in `AppContent` — that effect clears and
 * restores tabs when the selected vault changes, and the link's tab must be opened after it so it
 * wins (effects of one component run in declaration order).
 *
 * Any failure — unknown vault, no access, missing file — ends in the same toast: a link must not
 * reveal whether a vault or file exists. The file is fetched before a tab is opened, so a dead link
 * never leaves an error tab behind.
 */
export function useDeepLink({ vaults, selectedVaultId, dispatch, tabDispatch, apiClient }: UseDeepLinkOptions): void {
  const { t } = useTranslation()
  const [target, setTarget] = useState<DeepLinkTarget | null>(null)
  const tRef = useRef(t)
  const tabDispatchRef = useRef(tabDispatch)
  const apiClientRef = useRef(apiClient)
  useEffect(() => {
    tRef.current = t
    tabDispatchRef.current = tabDispatch
    apiClientRef.current = apiClient
  })

  // Pick the target up once. Consuming in an effect (not a state initializer) keeps it exactly-once
  // under StrictMode's double invocation: the second run finds nothing left.
  useEffect(() => {
    if (consumeInvalidDeepLink()) showToast('error', tRef.current('deepLink.invalid'))
    const pending = consumePendingDeepLink()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pending) setTarget(pending)
  }, [])

  useEffect(() => {
    if (!target || vaults.length === 0) return
    const fail = () => {
      showToast('error', tRef.current('deepLink.notFound'))
      setTarget(null)
    }

    const vaultId = resolveVaultRef(target.vault, vaults)
    if (vaultId === null) {
      fail()
      return
    }
    if (selectedVaultId !== vaultId) {
      // This effect runs again once the vault is selected (and the switch effect has settled).
      dispatch({ type: 'VAULT_SELECTED', payload: vaultId })
      return
    }
    const path = target.path
    if (path === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- vault-only link: nothing left to do
      setTarget(null)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const file = await apiClientRef.current.fetchFileContent(vaultId, path)
        if (cancelled) return
        const fileName = path.split('/').pop() ?? path
        const tabId = generateTabId(vaultId, path)
        tabDispatchRef.current({ type: 'OPEN_TAB', payload: { vaultId, filePath: path, fileName } })
        addRecentFile(vaultId, path)
        tabDispatchRef.current({ type: 'TAB_CONTENT_LOADED', payload: { tabId, content: file.content, isBinary: file.isBinary } })
        if (target.anchor) requestAnchorJump(tabId, target.anchor)
        setTarget(null)
      } catch {
        if (!cancelled) fail()
      }
    })()
    return () => { cancelled = true }
  }, [target, vaults, selectedVaultId, dispatch])
}
