/** Window event that asks the app to open the public-link dialog for a note. */
export const OPEN_PUBLIC_SHARE_EVENT = 'slatebase:open-public-share'

/** Detail of {@link OPEN_PUBLIC_SHARE_EVENT}. */
export interface OpenPublicShareDetail {
  vaultId: string
  filePath: string
}

/** Opens the public-link dialog for a note (handled in `App`). */
export function openPublicShareDialog(vaultId: string, filePath: string): void {
  window.dispatchEvent(new CustomEvent<OpenPublicShareDetail>(OPEN_PUBLIC_SHARE_EVENT, { detail: { vaultId, filePath } }))
}

/** Window event fired after a public link was created or revoked, so link markers can refresh. */
export const PUBLIC_SHARES_CHANGED_EVENT = 'slatebase:public-shares-changed'

/** Tells listeners (e.g. the file explorer) that the set of public links changed. */
export function notifyPublicSharesChanged(): void {
  window.dispatchEvent(new Event(PUBLIC_SHARES_CHANGED_EVENT))
}
