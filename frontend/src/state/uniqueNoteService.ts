import type { IApiClient } from '../api'

/**
 * Unique Note (Zettelkasten) service — creates a new note whose name is a
 * timestamp prefix (`YYYYMMDDHHmmss`), Obsidian's "Unique note" convention.
 *
 * The target folder is read from the vault config (`uniqueNoteDirectory`, empty
 * = vault root); the timestamp format itself is fixed. Kept as a standalone
 * module (like `dailyNoteService`) rather than inlined into the command so the
 * name-building logic is unit-testable without React.
 */

/**
 * Formats a Date as `YYYYMMDDHHmmss` using local calendar fields — the unique
 * note's base name.
 */
export function formatUniqueNoteStamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}${hours}${minutes}${seconds}`
}

/**
 * Builds the vault-relative path for a unique note: the timestamp name under
 * the configured directory (empty directory = vault root).
 */
export function buildUniqueNotePath(directory: string, stamp: string): string {
  const name = `${stamp}.md`
  return directory ? `${directory}/${name}` : name
}

/**
 * Creates a unique note for the current moment and returns its vault-relative
 * path. The target folder comes from the vault config; an unreadable config
 * falls back to the vault root. The timestamp resolution is one second, so a
 * (very unlikely) same-second second invocation would collide — the caller
 * surfaces the backend error rather than silently overwriting.
 */
export async function createUniqueNote(apiClient: IApiClient, vaultId: string): Promise<string> {
  let directory = ''
  try {
    const config = await apiClient.getVaultConfig(vaultId)
    directory = config.uniqueNoteDirectory ?? ''
  } catch {
    // Config unavailable — fall back to the vault root.
  }

  const stamp = formatUniqueNoteStamp(new Date())
  const path = buildUniqueNotePath(directory, stamp)
  await apiClient.saveFile(vaultId, path, '')
  return path
}
