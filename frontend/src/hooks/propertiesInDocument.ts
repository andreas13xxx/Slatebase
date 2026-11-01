/**
 * Properties in the document — whether a note's frontmatter shows as a properties block, stays hidden,
 * or shows as raw YAML. A vault setting in `.obsidian/app.json` (`propertiesInDocument`), the same key
 * Obsidian uses, so it is the same for everyone who opens the vault and changing it needs write access.
 *
 * Reached through the editor context menu, the command palette and Settings -> Editor and files.
 */
import { showToast } from '../components/ToastNotification'
import { extractErrorMessage } from '../utils/error'
import { getAppConfigValue, updateAppConfig, type AppConfigValues } from '../state/vaultAppConfigStore'

export type PropertiesInDocument = AppConfigValues['propertiesInDocument']

/** The mode a toggle switches to: visible properties are hidden, anything else becomes visible again. */
export function nextPropertiesInDocument(current: PropertiesInDocument): PropertiesInDocument {
  return current === 'visible' ? 'hidden' : 'visible'
}

/** Toggles the properties between visible and hidden from outside React (command palette, context menu). */
export function togglePropertiesInDocument(): void {
  updateAppConfig({ propertiesInDocument: nextPropertiesInDocument(getAppConfigValue('propertiesInDocument')) })
    .catch((error: unknown) => {
      showToast('error', `Vault-Einstellung konnte nicht gespeichert werden: ${extractErrorMessage(error)}`)
    })
}
