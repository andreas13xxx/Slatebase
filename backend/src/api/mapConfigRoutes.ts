/**
 * Map tile configuration route.
 *
 * Provides the operator-configured map tile source at `GET /api/v1/map-config`.
 * No authentication required — publicly accessible like the version route, and
 * the value is a public URL the browser's Leaflet instance fetches tiles from.
 *
 * Both values are env-only, like the transcription backend URL: they point at
 * infrastructure the operator runs (or an external tile server they chose to
 * accept the privacy trade-off for), not something an admin edits at runtime.
 * An empty/missing `SLATEBASE_MAP_TILE_URL` leaves `tileUrl` empty, and the
 * Bases Map view then stays inactive — the client decides that from this read.
 *
 * Why env-only and off by default: every tile request sends the user's IP to
 * the tile server. A hard-wired public tile server (OSM, Carto, Mapbox) would
 * be a silent privacy leak and, for OSM, a fair-use violation with several
 * users — so the operator must opt in by naming their own (or an allowed) tile
 * server. Mirrors `SLATEBASE_PROXY_ALLOWED_ORIGINS` and the Whisper backend URL.
 */

import { Hono } from 'hono';

const mapConfigRoutes = new Hono();

/** Treat empty/whitespace-only env values as "not set" (→ ''). */
function normalize(value: string | undefined): string {
  if (value === undefined) return '';
  const trimmed = value.trim();
  return trimmed;
}

/**
 * GET /api/v1/map-config
 * Returns the operator-configured map tile source.
 * Public, no authentication.
 *
 * @returns JSON `{ tileUrl: string, attribution: string }`. An empty `tileUrl`
 *   means no tile server is configured and the Bases Map view is inactive.
 */
mapConfigRoutes.get('/api/v1/map-config', (c) => {
  const tileUrl = normalize(process.env['SLATEBASE_MAP_TILE_URL']);
  const attribution = normalize(process.env['SLATEBASE_MAP_TILE_ATTRIBUTION']);
  return c.json({ tileUrl, attribution });
});

export { mapConfigRoutes };
