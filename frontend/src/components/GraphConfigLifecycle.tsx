/**
 * GraphConfigLifecycle — keeps the graph.json store pointed at the open vault and in sync with the
 * server (re-read when the vault changes and on `vault:change` for the file, e.g. from Obsidian or a
 * sync). Renders nothing; mounted once near the app root, next to AppearanceLifecycle.
 */
import { useEffect } from 'react'
import { useAppContext } from '../state'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { GRAPH_CONFIG_PATH, disconnect, initialize, refreshGraph, setActiveVault } from '../state/vaultGraphStore'

export function GraphConfigLifecycle(): null {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  useEffect(() => () => disconnect(), [])

  useEffect(() => {
    if (apiClient) initialize(apiClient)
  }, [apiClient])

  useEffect(() => {
    if (!apiClient) return
    void setActiveVault(vaultId)
    if (!vaultId) return
    return onRealtimeVaultChange((event) => {
      if (event.vaultId === vaultId && event.path === GRAPH_CONFIG_PATH) void refreshGraph(vaultId)
    })
  }, [apiClient, vaultId])

  return null
}
