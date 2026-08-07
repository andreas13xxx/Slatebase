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
      // Explicit include, not just exclude — otherwise v8's "all files" scan
      // also sweeps in non-app TS files like scripts/take-screenshots.ts.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/test-setup.ts',
        'src/main.tsx',
      ],
      // Baseline as of introducing coverage tracking (2026-08-07), with a
      // small safety margin below the measured numbers. Ratchet these up as
      // coverage improves — the point is to catch regressions, not to gate
      // on an aspirational target we're not at yet.
      thresholds: {
        statements: 36,
        branches: 31,
        functions: 34,
        lines: 38,
      },
    },
  },
})
