/**
 * toggleShowUnsupportedFiles — whether the file explorer shows files Slatebase cannot open.
 *
 * A vault setting in `.obsidian/app.json` (`showUnsupportedFiles`). Slatebase has always shown every
 * file, so the tree hides unsupported files ONLY when the key is explicitly `false`; an absent key (and
 * `true`) keeps the show-everything behaviour. The toggle therefore writes `null` (remove the key →
 * show) or `false` (→ hide), never a plain boolean flip, so it never silently flips existing vaults.
 */
import { showToast } from '../components/ToastNotification'
import { extractErrorMessage } from '../utils/error'
import { getAppConfigFileValue, updateAppConfig } from '../state/vaultAppConfigStore'

/** Toggles unsupported-file visibility from outside React (command palette). */
export function toggleShowUnsupportedFiles(): void {
  const currentlyHidden = getAppConfigFileValue('showUnsupportedFiles') === false
  updateAppConfig({ showUnsupportedFiles: currentlyHidden ? null : false })
    .catch((error: unknown) => {
      showToast('error', `Vault-Einstellung konnte nicht gespeichert werden: ${extractErrorMessage(error)}`)
    })
}
