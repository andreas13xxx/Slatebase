// Shared atomic file-write helper (write to temp file, then rename into place)

import { writeFile, rename, unlink } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'

/**
 * Writes `data` to `filePath` atomically: writes to a randomly-named temp
 * file next to it, then renames the temp file into place. A reader can
 * never observe a partially-written file.
 *
 * On Windows, rename can transiently fail with EPERM/EACCES if the target
 * is briefly locked (e.g. by antivirus or a file watcher). This retries
 * with backoff before falling back to a direct (non-atomic) overwrite as a
 * last resort, so a transient lock doesn't crash the write outright.
 */
export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const tempPath = `${filePath}.${randomBytes(8).toString('hex')}.tmp`
  await writeFile(tempPath, data, 'utf-8')

  try {
    await rename(tempPath, filePath)
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EACCES') {
      // Windows: target may be locked — wait briefly for lock release, then retry
      await new Promise((resolve) => setTimeout(resolve, 50))
      try { await unlink(filePath) } catch { /* may not exist */ }
      try {
        await rename(tempPath, filePath)
      } catch {
        // Second retry after another short delay
        await new Promise((resolve) => setTimeout(resolve, 100))
        try {
          await rename(tempPath, filePath)
        } catch {
          // Last resort: direct overwrite (loses atomicity but avoids crash)
          await writeFile(filePath, data, 'utf-8')
          try { await unlink(tempPath) } catch { /* cleanup */ }
        }
      }
    } else {
      // Clean up temp file and rethrow
      try { await unlink(tempPath) } catch { /* ignore */ }
      throw err
    }
  }
}
