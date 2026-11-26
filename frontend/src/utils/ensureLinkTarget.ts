import type { IApiClient } from '../api'

/**
 * Makes sure the note a link points at exists, creating an empty one only when the server
 * definitely says it is missing.
 *
 * The directory tree can be stale or not loaded yet, and `saveFile` overwrites without asking,
 * so a tree miss alone must never lead to a write. Any answer other than `FILE_NOT_FOUND`
 * (network error, 5xx, access denied) is rethrown instead of being read as "missing".
 *
 * @returns `'created'` when an empty note was written, `'existing'` otherwise.
 */
export async function ensureLinkTarget(
  apiClient: Pick<IApiClient, 'fetchFileContent' | 'saveFile'>,
  vaultId: string,
  filePath: string,
  knownInTree: boolean,
): Promise<'existing' | 'created'> {
  if (knownInTree) return 'existing'

  try {
    await apiClient.fetchFileContent(vaultId, filePath)
    return 'existing'
  } catch (err: unknown) {
    if ((err as { code?: unknown } | null)?.code !== 'FILE_NOT_FOUND') throw err
  }

  await apiClient.saveFile(vaultId, filePath, '')
  return 'created'
}
