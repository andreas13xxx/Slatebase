/**
 * Looks up whether the community plugin "Style Settings" is installed and active in a vault. A failed lookup is
 * "unknown", never "not installed".
 */
import { useContext, useEffect, useState } from 'react'
import type { IApiClient } from '../../api'
import { FeatureContext } from '../../state/featureContext'

/** Plugin id of Style Settings in the Obsidian community catalog. */
const STYLE_SETTINGS_PLUGIN_ID = 'obsidian-style-settings'

export type StyleSettingsPluginState = 'loading' | 'unavailable' | 'unknown' | 'missing' | 'inactive' | 'active'

/**
 * Looks up whether Style Settings is installed and active in the vault. Only queries while `needed` is true (a theme
 * with settings is listed). `unavailable` means the plugin compatibility feature is off for the whole server.
 */
export function useStyleSettingsPluginState(
  apiClient: IApiClient | null,
  vaultId: string | null,
  needed: boolean,
): StyleSettingsPluginState {
  const features = useContext(FeatureContext)
  const compatEnabled = features === null ? true : features.isEnabled('obsidian-plugin-compat')
  const [looked, setLooked] = useState<{ vaultId: string; state: StyleSettingsPluginState } | null>(null)

  useEffect(() => {
    if (!needed || !compatEnabled || !apiClient || !vaultId) return
    let cancelled = false
    apiClient.loadRegistry(vaultId)
      .then((registry) => {
        if (cancelled) return
        const entry = registry.plugins[STYLE_SETTINGS_PLUGIN_ID]
        setLooked({ vaultId, state: entry === undefined ? 'missing' : entry.status === 'active' ? 'active' : 'inactive' })
      })
      .catch(() => {
        if (!cancelled) setLooked({ vaultId, state: 'unknown' })
      })
    return () => { cancelled = true }
  }, [apiClient, vaultId, needed, compatEnabled])

  if (!compatEnabled) return 'unavailable'
  if (looked === null || looked.vaultId !== vaultId) return 'loading'
  return looked.state
}
