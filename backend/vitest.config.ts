import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest 4 no longer excludes dist/ by default, so a local `npm run build`
    // leaves compiled copies of every test behind for the next run to collect —
    // doubling the test count and skewing coverage against dist/ instead of src/.
    // CI never hits this (it builds after testing), which is exactly why it has
    // to be pinned here: otherwise local and CI numbers disagree.
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Explicit include, not just exclude — otherwise v8's "all files" scan
      // sweeps in backend/data/ (gitignored runtime state: uploaded vaults,
      // installed plugin bundles like Excalidraw/Kanban main.js, their
      // vendored deps) which isn't our code and doesn't exist in a fresh CI
      // checkout, making local and CI coverage numbers diverge.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/integration.test.ts',
      ],
      // Baseline as of introducing coverage tracking (2026-08-07), with a
      // small safety margin below the measured numbers. Ratchet these up as
      // coverage improves — the point is to catch regressions, not to gate
      // on an aspirational target we're not at yet.
      //
      // Branch/function numbers are much lower than v8 reported under
      // coverage-v8 v3 (84%/78% vs. 42%/53% for identical tests): v4 made
      // AST-aware remapping the default, which stopped crediting branches and
      // functions the tests never actually reach. Nothing got worse — the
      // measurement got honest. Don't "restore" the old figures.
      thresholds: {
        statements: 50,
        branches: 41,
        functions: 52,
        lines: 50,
      },
    },
  },
});
