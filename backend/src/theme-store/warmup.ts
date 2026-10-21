// ─── Catalog warm-up ──────────────────────────────────────────────────────────

import type { ILogger } from '../logger/index.js'
import type { IThemeStoreCache } from './theme-store-cache.js'
import type { IThemeStoreClient } from './types.js'

/**
 * Fetches the community catalog once after startup so the first visit to "Entdecken" is instant.
 *
 * Meant to be called WITHOUT `await` from the startup path: it never rejects and never retries. When the network is
 * unreachable (offline operation) it logs one warning and leaves the persisted catalog — if any — in place; the next
 * request after the TTL fetches again. A catalog that is still fresh from disk needs no request at all.
 *
 * @returns the number of catalog entries now cached, or null when nothing was fetched
 */
export async function warmThemeStoreCatalog(
  client: IThemeStoreClient,
  cache: IThemeStoreCache,
  logger: ILogger,
): Promise<number | null> {
  try {
    const fresh = cache.getCatalog()
    if (fresh !== null) {
      logger.debug('Theme store catalog is fresh, skipping warm-up', { entries: fresh.length })
      return null
    }
    const entries = await client.fetchCatalog()
    cache.setCatalog(entries)
    logger.info('Theme store catalog warmed', { entries: entries.length })
    return entries.length
  } catch (error: unknown) {
    logger.warn('Theme store catalog warm-up failed; continuing with the persisted catalog', {
      error: error instanceof Error ? error.message : String(error),
      hasStaleCatalog: cache.getCatalogStale() !== null,
    })
    return null
  }
}
