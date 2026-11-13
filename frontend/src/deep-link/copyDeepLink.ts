/**
 * "Copy link" for the active tab: builds the deep link and puts it on the clipboard.
 *
 * @module deep-link/copyDeepLink
 */
import { buildDeepLink, isSafeVaultPath } from './deepLink'
import { showToast } from '../components/ToastNotification'

/** Tab paths that stand for a view, not a file in the vault (graph, plugin view, web page, local graph). */
const NON_FILE_TAB_PREFIXES = ['__graph__', '__view::', '__webview::', '__local-graph::']

/** Whether a tab path names a real vault file. */
export function isVaultFileTabPath(filePath: string): boolean {
  return !NON_FILE_TAB_PREFIXES.some((prefix) => filePath.startsWith(prefix)) && isSafeVaultPath(filePath)
}

/**
 * Link for the active tab: the file when it is one, otherwise the vault alone (graph, plugin views
 * and web pages have no file to point at).
 *
 * @returns The link, or `null` when no vault is open.
 */
export function buildActiveTabLink(origin: string, vaultId: string | null, activeFilePath: string | null): string | null {
  if (!vaultId) return null
  const path = activeFilePath !== null && isVaultFileTabPath(activeFilePath) ? activeFilePath : undefined
  return buildDeepLink(origin, vaultId, path)
}

/**
 * Writes text to the clipboard.
 *
 * @returns `false` when the Clipboard API is missing (insecure context) or refuses, so the caller
 *   can show the text for manual copying.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** How long the fallback toast (link shown for manual copying) stays up. */
const FALLBACK_TOAST_MS = 15000

/**
 * Copies the link for the given tab path and tells the user what happened: success, a hint to copy
 * by hand when the clipboard is unavailable, or an error when no vault is open.
 */
export async function copyLinkWithFeedback(vaultId: string | null, activeFilePath: string | null): Promise<void> {
  const link = buildActiveTabLink(window.location.origin, vaultId, activeFilePath)
  if (!link) {
    showToast('error', 'Kein Vault geöffnet')
    return
  }
  if (await writeToClipboard(link)) {
    showToast('success', 'Link kopiert')
  } else {
    // No Clipboard API (insecure context) or refused: show the link so it can be copied by hand.
    showToast('info', `Link: ${link}`, FALLBACK_TOAST_MS)
  }
}
