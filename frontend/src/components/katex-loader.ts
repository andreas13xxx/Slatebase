/**
 * KaTeX lazy-loader — identical pattern to loadMermaid() in MermaidRenderer.tsx.
 *
 * Loads the KaTeX library on first use and caches the result at module level.
 * CSS is injected as a <link> element on first successful load.
 */

import type katexType from 'katex'

/** Render timeout per formula in milliseconds. */
export const MATH_RENDER_TIMEOUT_MS = 2000

/** Module-level cached promise for the KaTeX library. */
let katexPromise: Promise<typeof katexType | null> | null = null

/** Whether the KaTeX CSS stylesheet has been injected. */
let cssInjected = false

/**
 * Injects the KaTeX CSS stylesheet into <head> (once).
 * Uses Vite's asset resolution via a direct import of the CSS path.
 */
function injectKaTeXCSS(): void {
  if (cssInjected) return
  cssInjected = true

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = new URL('katex/dist/katex.min.css', import.meta.url).href
  document.head.appendChild(link)
}

/**
 * Lazily loads and caches the KaTeX library.
 * Returns the katex default export or null on load failure.
 * The promise is cached at module level — subsequent calls return the same promise.
 * CSS is injected on first successful load.
 */
export function loadKaTeX(): Promise<typeof katexType | null> {
  if (katexPromise === null) {
    katexPromise = import('katex')
      .then((mod) => {
        const katex = mod.default ?? mod
        injectKaTeXCSS()
        return katex as typeof katexType
      })
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
