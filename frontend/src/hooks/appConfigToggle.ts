/**
 * Flips a boolean vault setting from app.json and tells the user when it is refused.
 * The setting is part of the vault (`.obsidian/app.json`), so changing it needs write access.
 */
import { showToast } from '../components/ToastNotification'
import { extractErrorMessage } from '../utils/error'
import { getAppConfigValue, updateAppConfig, type AppConfigKey, type AppConfigValues } from '../state/vaultAppConfigStore'

type BooleanKey = { [K in AppConfigKey]: AppConfigValues[K] extends boolean ? K : never }[AppConfigKey]

export function toggleAppConfigFlag(key: BooleanKey): void {
  updateAppConfig({ [key]: !getAppConfigValue(key) }).catch((error: unknown) => {
    showToast('error', `Vault-Einstellung konnte nicht gespeichert werden: ${extractErrorMessage(error)}`)
  })
}
