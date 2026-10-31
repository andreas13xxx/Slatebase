/**
 * AppearanceLifecycle — keeps the appearance.json store pointed at the open vault and in sync with
 * the server, and puts its CSS variables (accent colour, fonts, font size) on the page. Renders
 * nothing; mounted once near the app root, next to ThemeLifecycle. The theme itself
 * (`cssTheme`) is ThemeLifecycle's job.
 *
 * It is only mounted while someone is logged in; unmounting it removes the variables again.
 */
import { useEffect } from 'react'
import { appearanceCssVariables, type AppearanceConfigValues } from '@slatebase/shared-contracts'
import { useAppContext } from '../state'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'
import {
  APPEARANCE_CONFIG_PATH,
  disconnect,
  initialize,
  refreshAppearance,
  setActiveVault,
  useAppearanceSnapshot,
} from '../state/vaultAppearanceStore'
import { applyAppearanceVariables, clearAppearanceVariables } from '../plugins/appearance/appearance-variables'

export function AppearanceLifecycle(): null {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId
  const snapshot = useAppearanceSnapshot()

  useEffect(() => () => {
    disconnect()
    clearAppearanceVariables()
  }, [])

  useEffect(() => {
    if (apiClient) initialize(apiClient)
  }, [apiClient])

  useEffect(() => {
    if (!apiClient) return
    void setActiveVault(vaultId)
    if (!vaultId) return
    return onRealtimeVaultChange((event) => {
      if (event.vaultId === vaultId && event.path === APPEARANCE_CONFIG_PATH) void refreshAppearance(vaultId)
    })
  }, [apiClient, vaultId])

  useEffect(() => {
    applyAppearanceVariables(appearanceCssVariables(snapshot as unknown as AppearanceConfigValues))
  }, [snapshot])

  return null
}
