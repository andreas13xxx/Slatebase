import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Reads the application version from the available sources.
 *
 * Fallback chain:
 * 1. `SLATEBASE_VERSION` environment variable (set by Docker / CI)
 * 2. `version.json` file in the backend project root
 * 3. `'development'` as final fallback
 *
 * @returns The current application version string.
 */
export function getVersion(): string {
  // 1. Environment variable (set by Docker / CI)
  const envVersion = process.env.SLATEBASE_VERSION;
  if (envVersion) {
    return envVersion;
  }

  // 2. version.json file
  try {
    const versionFile = resolve(import.meta.dirname, '../version.json');
    const content = readFileSync(versionFile, 'utf-8');
    const parsed = JSON.parse(content) as { version?: string };
    if (parsed.version) {
      return parsed.version;
    }
  } catch {
    // File not found or not parseable — fall through
  }

  // 3. Fallback
  return 'development';
}
