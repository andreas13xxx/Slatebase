/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Hunspell dictionaries served to the spellcheck worker, and the npm packages
 * they come from. German is the default (see `<html lang="de">` and
 * DEFAULT_SPELLCHECK_LANGUAGE); the language is switchable per editor.
 */
const SPELLCHECK_DICTIONARIES = [
  { language: 'de', pkg: 'dictionary-de' },
  { language: 'en', pkg: 'dictionary-en' },
] as const

/**
 * Publishes the Hunspell dictionaries at `/dictionaries/<lang>.{aff,dic}`.
 *
 * They cannot simply be imported: `dictionary-de@3`'s entry point reads its
 * data with `node:fs`, which no bundler can follow into the browser, and its
 * `"exports": "./index.js"` blocks a deep import of the raw `.aff`/`.dic`
 * files. Serving them as static assets is the better shape anyway — the
 * German dictionary alone is 1.1 MB, so keeping it out of the JS bundle means
 * the initial page load never pays for it and the browser caches it on its own.
 *
 * The `license` file of each package ships alongside: both German dictionaries
 * are GPL-2.0-or-3.0 (compatible with Slatebase's AGPL-3.0), and the licence
 * has to travel with the distributed data.
 */
function spellcheckDictionaries(): Plugin {
  const configDir = fileURLToPath(new URL('.', import.meta.url))

  function resolveFile(pkg: string, file: string): string {
    const candidates = [
      path.join(configDir, 'node_modules', pkg, file),
      path.join(configDir, '..', 'node_modules', pkg, file),
    ]
    const found = candidates.find((candidate) => existsSync(candidate))
    if (!found) {
      throw new Error(`[spellcheck] ${pkg}/${file} not found — run "npm install" in frontend/`)
    }
    return found
  }

  return {
    name: 'slatebase-spellcheck-dictionaries',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0] ?? ''
        const match = /^\/dictionaries\/([a-z]{2})\.(aff|dic)$/.exec(pathname)
        const entry = match && SPELLCHECK_DICTIONARIES.find((d) => d.language === match[1])
        if (!match || !entry) {
          next()
          return
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(readFileSync(resolveFile(entry.pkg, `index.${match[2]}`)))
      })
    },

    generateBundle() {
      for (const { language, pkg } of SPELLCHECK_DICTIONARIES) {
        for (const extension of ['aff', 'dic'] as const) {
          this.emitFile({
            type: 'asset',
            fileName: `dictionaries/${language}.${extension}`,
            source: readFileSync(resolveFile(pkg, `index.${extension}`)),
          })
        }
        this.emitFile({
          type: 'asset',
          fileName: `dictionaries/${language}.license.txt`,
          source: readFileSync(resolveFile(pkg, 'license')),
        })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), spellcheckDictionaries()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Replaces Vitest's default excludes, so dist/ has to be listed explicitly —
    // Vitest 4 no longer excludes it on its own, and a local build would
    // otherwise leave artifacts for the next run to collect.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Otherwise a handful of failing tests (unrelated to coverage) blocks
      // the report entirely, hiding coverage for everything else too.
      reportOnFailure: true,
      // Explicit include, not just exclude — otherwise v8's "all files" scan
      // also sweeps in non-app TS files like scripts/take-screenshots.ts.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/test-setup.ts',
        'src/main.tsx',
      ],
      // Ratcheted up 2026-08-21 after bringing every directory to ≥20% line
      // coverage (was 36/31/34/38). Small safety margin below the measured
      // numbers (48.25/40.54/45.44/49.96) — the point is to catch
      // regressions, not to gate on an aspirational target we're not at yet.
      thresholds: {
        statements: 46,
        branches: 38,
        functions: 43,
        lines: 48,
      },
    },
  },
})
