/**
 * Client-side cache for vault statistics.
 *
 * Stores fetched vault statistics per vault ID, invalidates on `vault:change` SSE events.
 * On error or timeout, shows fallback text without overwriting cached values.
 */

import type { IApiClient } from '../api'

// ─── Types ───────────────────────────────────────────────────────────────────

/** Cached vault statistics entry. */
export interface VaultStatisticsEntry {
  fileCount: number
  folderCount: number
  formattedSize: string
}

// ─── Module-Level State ──────────────────────────────────────────────────────

const cache = new Map<string, VaultStatisticsEntry>()
const inflight = new Map<string, Promise<VaultStatisticsEntry | null>>()

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get cached statistics for a vault.
 * Returns the cached entry or null if not yet fetched.
 */
export function getCachedStatistics(vaultId: string): VaultStatisticsEntry | null {
  return cache.get(vaultId) ?? null
}

/**
 * Fetch vault statistics. Returns cached value immediately if available.
 * Otherwise fetches from the API and caches the result.
 * On error/timeout: returns null without overwriting cached values.
 */
export async function fetchVaultStatistics(
  apiClient: IApiClient,
  vaultId: string
): Promise<VaultStatisticsEntry | null> {
  // Return cached value if available
  const cached = cache.get(vaultId)
  if (cached) return cached

  // If a request is already in-flight, reuse it
  const existing = inflight.get(vaultId)
  if (existing) return existing

  // Fetch from API with a 5-second timeout
  const promise = fetchWithTimeout(apiClient, vaultId)
  inflight.set(vaultId, promise)

  try {
    const result = await promise
    return result
  } finally {
    inflight.delete(vaultId)
  }
}

/**
 * Invalidate cached statistics for a vault.
 * Called when a `vault:change` SSE event is received for that vault.
 */
export function invalidateStatisticsCache(vaultId: string): void {
  cache.delete(vaultId)
}

/**
 * Format the tooltip text from a statistics entry.
 */
export function formatStatisticsTooltip(entry: VaultStatisticsEntry): string {
  return `${entry.fileCount} Dateien, ${entry.folderCount} Ordner\nGesamtgröße: ${entry.formattedSize}`
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

async function fetchWithTimeout(
  apiClient: IApiClient,
  vaultId: string
): Promise<VaultStatisticsEntry | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const result = await apiClient.getVaultStatistics(vaultId)
      clearTimeout(timeout)

      const entry: VaultStatisticsEntry = {
        fileCount: result.fileCount,
        folderCount: result.folderCount,
        formattedSize: result.formattedSize,
      }
      cache.set(vaultId, entry)
      return entry
    } catch {
      clearTimeout(timeout)
      // Don't overwrite cached value on error/timeout
      return null
    }
  } catch {
    return null
  }
}
