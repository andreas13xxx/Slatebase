/**
 * KaTeX lazy-loader — identical pattern to loadMermaid() in MermaidRenderer.tsx.
 *
 * Loads the KaTeX library on first use and caches the result at module level.
 */

import type katexType from 'katex'

/** Render timeout per formula in milliseconds. */
export const MATH_RENDER_TIMEOUT_MS = 2000

/** Module-level cached promise for the KaTeX library. */
let katexPromise: Promise<typeof katexType | null> | null = null

/**
 * Lazily loads and caches the KaTeX library.
 * Returns the katex default export or null on load failure.
 * The promise is cached at module level — subsequent calls return the same promise.
 *
 * The CSS is a dynamic `import()` of the stylesheet itself, not a `new URL(...,
 * import.meta.url)` reference to it: the latter makes Vite treat the whole file as an
 * opaque binary asset (just copied byte-for-byte, hashed filename), so it never parses
 * the `url(fonts/KaTeX_*.woff2)` references inside — those fonts then never get copied
 * into the build and the KaTeX-served CSS 404s on every one of them in production. A
 * dynamic CSS import goes through Vite's real CSS pipeline instead: it rewrites those
 * `url()`s to the correct hashed asset paths, copies the referenced font files, and
 * (this being a dynamic import) still only loads any of it on first actual use, injecting
 * its own <link> automatically — no manual DOM injection needed.
 */
export function loadKaTeX(): Promise<typeof katexType | null> {
  if (katexPromise === null) {
    katexPromise = Promise.all([import('katex'), import('katex/dist/katex.min.css')])
      .then(([mod]) => (mod.default ?? mod) as typeof katexType)
      .catch(() => null)
  }
  return katexPromise
}

/**
 * Renders a LaTeX string to an HTML string via KaTeX.
 * Throws on parse error; caller handles the fallback.
 */
export function renderMathToString(
  katex: typeof katexType,
  source: string,
  displayMode: boolean,
): string {
  return katex.renderToString(source, {
    displayMode,
    throwOnError: true,
    strict: false,
    trust: false,
  })
}
