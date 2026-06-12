/**
 * Version route handler.
 * Provides the current Slatebase version at `GET /api/v1/version`.
 * No authentication required — publicly accessible.
 */

import { Hono } from 'hono';
import { getVersion } from '../version.js';

const versionRoutes = new Hono();

/**
 * GET /api/v1/version
 * Returns the currently installed Slatebase version.
 * This endpoint is public and does not require authentication.
 *
 * @returns JSON response `{ "version": "X.Y.Z" }` with HTTP 200.
 */
versionRoutes.get('/api/v1/version', (c) => {
  const version = getVersion();
  return c.json({ version });
});

export { versionRoutes };
