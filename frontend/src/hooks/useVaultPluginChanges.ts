import { useEffect, useRef } from 'react'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'

const PLUGINS_PREFIX = '.obsidian/plugins/'
const COMMUNITY_PLUGINS_PATH = '.obsidian/community-plugins.json'

/**
 * True for the paths that change which plugins a vault has or which of them are enabled.
 * A plugin's own `data.json` is not included: plugins write it while they run, and its
 * changes have their own event (`plugin-settings:change`).
 */
export function isPluginListPath(path: string): boolean {
  if (path === COMMUNITY_PLUGINS_PATH) return true
  return path.startsWith(PLUGINS_PREFIX) && !path.endsWith('/data.json')
}

/**
 * Calls `onChange` when the server reports that the plugins of `vaultId` changed — a plugin was
 * installed, updated or deleted, or the enabled list changed, by another user, tab or a sync.
 *
 * Only meant for refreshing what is *shown*: a plugin that is already running is never reloaded
 * by this (that would throw away its state and handlers); it picks up the change on the next
 * page load. Bursts (a bulk update touches many plugins) are coalesced into one call.
 */
export function useVaultPluginChanges(vaultId: string, onChange: () => void, debounceMs = 300): void {
  // Always call the latest callback without re-subscribing when it changes identity.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = onRealtimeVaultChange((event) => {
      if (event.vaultId !== vaultId || !isPluginListPath(event.path)) return
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        onChangeRef.current()
      }, debounceMs)
    })
    return () => {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
    }
  }, [vaultId, debounceMs])
}
