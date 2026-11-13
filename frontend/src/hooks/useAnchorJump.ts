import { useEffect, useRef } from 'react'
import type { DeepLinkAnchor } from '../deep-link/deepLink'
import { onAnchorJumpRequest, peekAnchorJump, takeAnchorJump } from '../state/anchorJumpBridge'

/** How often and how long to retry while the note is still rendering (≈ 2 s). */
const RETRY_INTERVAL_MS = 50
const MAX_ATTEMPTS = 40

/**
 * Applies a parked deep-link anchor to the tab on screen once it is ready.
 *
 * `apply` returns `true` when it is finished with the anchor (scrolled, or the anchor does not exist
 * in the note) and `false` when the note is not rendered yet — the hook then retries a bounded
 * number of times and finally drops the request, so a stale anchor can never jump later.
 *
 * @param tabId - The tab on screen (`null` when none).
 * @param ready - The tab's content is loaded and shown.
 * @param apply - Scrolls to the anchor; may change identity freely, the latest one is used.
 * @param modeKey - Re-runs the jump when the tab switches between editor and reading view.
 */
export function useAnchorJump(
  tabId: string | null,
  ready: boolean,
  apply: (anchor: DeepLinkAnchor) => boolean,
  modeKey: string,
): void {
  const applyRef = useRef(apply)
  useEffect(() => {
    applyRef.current = apply
  })

  useEffect(() => {
    if (!tabId || !ready) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0

    const run = () => {
      timer = undefined
      const anchor = peekAnchorJump(tabId)
      if (!anchor) return
      if (applyRef.current(anchor)) {
        takeAnchorJump(tabId)
        return
      }
      attempts += 1
      if (attempts >= MAX_ATTEMPTS) {
        takeAnchorJump(tabId)
        return
      }
      timer = setTimeout(run, RETRY_INTERVAL_MS)
    }

    run()
    const unsubscribe = onAnchorJumpRequest((requestedTabId) => {
      if (requestedTabId !== tabId) return
      attempts = 0
      if (timer !== undefined) clearTimeout(timer)
      run()
    })
    return () => {
      unsubscribe()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [tabId, ready, modeKey])
}
