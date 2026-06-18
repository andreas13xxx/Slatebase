/**
 * MermaidRenderer — Mermaid diagram rendering component.
 *
 * Renders Mermaid diagram definitions as inline SVGs with lazy loading,
 * timeout protection, theme-aware initialization, and error isolation.
 */

import { useState, useEffect, useRef } from 'react'

/**
 * Props for the MermaidRenderer component.
 */
export interface MermaidRendererProps {
  /** The raw Mermaid diagram definition (content of the fenced code block) */
  code: string
  /** Unique key for React reconciliation and diagram identification */
  diagramKey: string
}

/**
 * Internal rendering state of a single MermaidRenderer instance.
 * Discriminated union on the `status` field.
 */
export type RenderState =
  | { status: 'loading' }
  | { status: 'rendered'; svg: string }
  | { status: 'error'; message: string }
  | { status: 'timeout' }
  | { status: 'load-failed' }

/** Timeout in milliseconds for a single diagram render */
export const RENDER_TIMEOUT_MS = 5000

/** Prefix for generated diagram IDs */
export const DIAGRAM_ID_PREFIX = 'mermaid-diagram-'

/**
 * Monotonically increasing counter for unique diagram ID generation.
 * Module-scoped to guarantee uniqueness within a page session.
 */
let diagramIdCounter = 0

/**
 * Generates a unique ID for each Mermaid diagram render call.
 * Uses a monotonically increasing counter to guarantee uniqueness within a page session.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function generateDiagramId(): string {
  diagramIdCounter += 1
  return `${DIAGRAM_ID_PREFIX}${diagramIdCounter}`
}

/**
 * Determines the current effective color scheme.
 * Checks the `data-theme` attribute on `document.documentElement` first,
 * falls back to the `prefers-color-scheme` media query.
 *
 * @returns 'dark' or 'light'
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getEffectiveTheme(): 'dark' | 'light' {
  const dataTheme = document.documentElement.getAttribute('data-theme')
  if (dataTheme === 'dark') return 'dark'
  if (dataTheme === 'light') return 'light'

  // Fallback: check system preference via media query
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

/**
 * Maps the effective theme to a Mermaid theme name.
 * - 'light' → 'default' (Mermaid's default light theme)
 * - 'dark' → 'dark' (Mermaid's dark theme)
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getMermaidTheme(effectiveTheme: 'dark' | 'light'): 'default' | 'dark' {
  return effectiveTheme === 'dark' ? 'dark' : 'default'
}

/**
 * Module-level cached promise for the mermaid library.
 * Once the import is initiated, subsequent calls return the same promise.
 */
let mermaidPromise: Promise<typeof import('mermaid')['default'] | null> | null = null

/**
 * Lazily loads and caches the mermaid library.
 * Returns the mermaid default export or null on load failure.
 * The promise is cached at module level — subsequent calls return the same promise.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function loadMermaid(): Promise<typeof import('mermaid')['default'] | null> {
  if (mermaidPromise === null) {
    mermaidPromise = import('mermaid')
      .then((mod) => mod.default)
      .catch(() => null)
  }
  return mermaidPromise
}

/** Type alias for the mermaid default export */
type MermaidType = Awaited<ReturnType<typeof loadMermaid>> & object

/**
 * Renders a diagram with a timeout guard.
 * Uses Promise.race to reject if rendering takes longer than RENDER_TIMEOUT_MS.
 * The timeout error has message 'TIMEOUT' to allow callers to distinguish it.
 */
async function renderWithTimeout(
  mermaidInstance: MermaidType,
  id: string,
  code: string
): Promise<{ svg: string }> {
  const renderPromise = mermaidInstance.render(id, code)
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), RENDER_TIMEOUT_MS)
  )
  return Promise.race([renderPromise, timeoutPromise])
}

/**
 * MermaidRenderer — React component for rendering Mermaid diagram definitions as inline SVGs.
 *
 * Handles the full rendering lifecycle:
 * 1. Lazy-loads the mermaid library
 * 2. Initializes mermaid with strict security and current theme
 * 3. Renders the diagram with a 5-second timeout
 * 4. Manages state transitions (loading → rendered | error | timeout | load-failed)
 * 5. Cleans up pending renders on unmount
 */
export function MermaidRenderer({ code, diagramKey }: MermaidRendererProps) {
  const [state, setState] = useState<RenderState>({ status: 'loading' })

  // Ref to track current code prop for re-rendering without adding code to observer effect deps
  const codeRef = useRef(code)
  useEffect(() => {
    codeRef.current = code
  })

  useEffect(() => {
    let cancelled = false

    async function doRender() {
      // Step 1: Load the mermaid library
      const mermaid = await loadMermaid()

      if (cancelled) return

      if (mermaid === null) {
        setState({ status: 'load-failed' })
        return
      }

      // Step 2: Initialize mermaid with security and theme settings
      mermaid.initialize({
        securityLevel: 'strict',
        theme: getMermaidTheme(getEffectiveTheme()),
        startOnLoad: false,
        suppressErrorRendering: true,
      })

      // Step 3: Render with timeout protection
      try {
        const { svg } = await renderWithTimeout(mermaid, generateDiagramId(), code)

        if (cancelled) return

        setState({ status: 'rendered', svg })
      } catch (err: unknown) {
        if (cancelled) return

        const message = err instanceof Error ? err.message : 'Unknown error'

        if (message === 'TIMEOUT') {
          setState({ status: 'timeout' })
        } else {
          setState({ status: 'error', message })
        }
      }
    }

    doRender()

    return () => {
      cancelled = true
    }
  }, [code, diagramKey])

  // Theme change observer: re-renders diagram when data-theme attribute changes
  useEffect(() => {
    const observer = new MutationObserver(async (mutations) => {
      // Only re-render if we have a successfully rendered diagram
      if (state.status !== 'rendered') return

      // Check if data-theme actually changed
      const themeChanged = mutations.some(
        (m) => m.type === 'attributes' && m.attributeName === 'data-theme'
      )
      if (!themeChanged) return

      try {
        const mermaid = await loadMermaid()
        if (mermaid === null) return

        // Re-initialize with new theme
        mermaid.initialize({
          securityLevel: 'strict',
          theme: getMermaidTheme(getEffectiveTheme()),
          startOnLoad: false,
          suppressErrorRendering: true,
        })

        // Re-render with a new unique ID
        const { svg } = await renderWithTimeout(mermaid, generateDiagramId(), codeRef.current)
        setState({ status: 'rendered', svg })
      } catch (err: unknown) {
        // On re-render error: keep last successful SVG, log error to console
        console.warn('[MermaidRenderer] Theme re-render failed:', err)
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => {
      observer.disconnect()
    }
  }, [state.status])

  switch (state.status) {
    case 'loading':
      return (
        <div className="view-mode-mermaid mermaid-loading">
          <span>Diagramm wird geladen…</span>
        </div>
      )

    case 'rendered':
      return (
        <div
          className="view-mode-mermaid"
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      )

    case 'error':
      return (
        <div className="view-mode-mermaid mermaid-error">
          <p className="mermaid-error-message">{state.message}</p>
          <pre className="view-mode-code"><code>{code}</code></pre>
        </div>
      )

    case 'timeout':
      return (
        <div className="view-mode-mermaid mermaid-error">
          <p className="mermaid-error-message">Diagramm-Rendering abgebrochen (Timeout)</p>
          <pre className="view-mode-code"><code>{code}</code></pre>
        </div>
      )

    case 'load-failed':
      return (
        <pre className="view-mode-code"><code>{code}</code></pre>
      )
  }
}
