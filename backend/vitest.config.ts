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
      // Otherwise a handful of failing tests (unrelated to coverage) blocks
      // the report entirely, hiding coverage for everything else too.
      reportOnFailure: true,
      // Explicit include, not just exclude — otherwise v8's "all files" scan
      // sweeps in backend/data/ (gitignored runtime state: uploaded vaults,
      // installed plugin bundles like Excalidraw/Kanban main.js, their
      // vendored deps) which isn't our code and doesn't exist in a fresh CI
      // checkout, making local and CI coverage numbers diverge.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/integration.test.ts',
        // Composition root — dependency wiring and server bootstrap, not
        // meaningfully unit-testable. Same call as excluding main.tsx on
        // the frontend side.
        'src/index.ts',
      ],
      // Ratcheted up 2026-08-21 after bringing every directory to ≥20% line
      // coverage (was 50/41/52/50). Small safety margin below the measured
      // numbers (60.4/49.14/67.18/61.02) — the point is to catch
      // regressions, not to gate on an aspirational target we're not at yet.
      //
      // Branch/function numbers are much lower than v8 reported under
      // coverage-v8 v3 (84%/78% vs. 42%/53% for identical tests): v4 made
      // AST-aware remapping the default, which stopped crediting branches and
      // functions the tests never actually reach. Nothing got worse — the
      // measurement got honest. Don't "restore" the old figures.
      thresholds: {
        statements: 58,
        branches: 47,
        functions: 65,
        lines: 59,
      },
    },
  },
});
