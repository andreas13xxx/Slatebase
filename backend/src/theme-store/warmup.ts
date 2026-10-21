// ─── Catalog warm-up ──────────────────────────────────────────────────────────

import type { ILogger } from '../logger/index.js'
import type { ThemeCatalogResult } from './types.js'

/** What the warm-up needs: the service's catalog lookup, which already caches and shares one request per refresh. */
export interface CatalogSource {
  listCatalog(): Promise<ThemeCatalogResult>
}

/**
 * Loads the community catalog once after startup so the first visit to "Entdecken" is instant.
 *
 * Meant to be called WITHOUT `await` from the startup path: it never rejects and never retries. It goes through the
 * service's own lookup, so a catalog that is still fresh from disk needs no request, and a user who opens the tab while
 * the warm-up is still running shares its request instead of starting a second one. When the network is unreachable
 * (offline operation) it logs one warning and the persisted catalog — if any — stays in use.
 *
 * @returns the number of catalog entries now available, or null when none could be loaded or only a stale list is left
 */
export async function warmThemeStoreCatalog(source: CatalogSource, logger: ILogger): Promise<number | null> {
  try {
    const { themes, stale } = await source.listCatalog()
    if (stale) {
      logger.warn('Theme store catalog warm-up could not refresh the catalog; continuing with the persisted list', { entries: themes.length })
      return null
    }
    logger.info('Theme store catalog ready', { entries: themes.length })
    return themes.length
  } catch (error: unknown) {
    logger.warn('Theme store catalog warm-up failed; the catalog loads on first use', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
