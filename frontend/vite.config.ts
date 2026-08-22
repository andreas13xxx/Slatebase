/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
