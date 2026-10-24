// Retry helpers for filesystem calls that hit transient locks (OneDrive, antivirus on Windows).

import { isNodeError } from './fs-utils.js'

/** Attempts for reads/renames that can hit transient Windows locks. */
const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 50
const TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Runs `fn`, retrying a few times on transient lock errors. Other errors propagate at once. */
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn()
    } catch (error: unknown) {
      const transient = isNodeError(error) && error.code !== undefined && TRANSIENT_CODES.has(error.code)
      if (!transient || attempt >= RETRY_ATTEMPTS) throw error
      await delay(RETRY_DELAY_MS * attempt)
    }
  }
}

/** True for ENOENT/ENOTDIR — the path (or a parent) does not exist. */
export function isMissing(error: unknown): boolean {
  return isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}
