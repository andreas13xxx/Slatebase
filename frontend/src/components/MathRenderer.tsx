/**
 * MathRenderer — LaTeX math rendering component.
 *
 * Renders LaTeX math expressions using KaTeX with lazy loading,
 * timeout protection, and error isolation.
 * Pattern mirrors MermaidRenderer.tsx.
 */

import { useState, useEffect } from 'react'
import { loadKaTeX, renderMathToString, MATH_RENDER_TIMEOUT_MS } from './katex-loader'
import { useTranslation } from '../i18n'

/**
 * Props for the MathRenderer component.
 */
export interface MathRendererProps {
  /** The raw LaTeX source */
  source: string
  /** Whether to render in display mode (block, centered) or inline */
  displayMode: boolean
}

/**
 * Internal rendering state of a single MathRenderer instance.
 */
export type MathRenderState =
  | { status: 'loading' }
  | { status: 'rendered'; html: string }
  | { status: 'error'; message: string }
  | { status: 'timeout' }
  | { status: 'load-failed' }

/**
 * MathRenderer — React component for rendering LaTeX math via KaTeX.
 *
 * Handles the full rendering lifecycle:
 * 1. Lazy-loads the KaTeX library
 * 2. Renders the formula with a timeout guard
 * 3. Manages state transitions (loading → rendered | error | timeout | load-failed)
 */
export function MathRenderer({ source, displayMode }: MathRendererProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<MathRenderState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function doRender() {
      const katex = await loadKaTeX()

      if (cancelled) return

      if (katex === null) {
        setState({ status: 'load-failed' })
        return
      }

      try {
        const renderPromise = new Promise<string>((resolve, reject) => {
          try {
            resolve(renderMathToString(katex, source, displayMode))
          } catch (err) {
            reject(err)
          }
        })

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), MATH_RENDER_TIMEOUT_MS)
        )

        const html = await Promise.race([renderPromise, timeoutPromise])

        if (cancelled) return
        setState({ status: 'rendered', html })
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
  }, [source, displayMode])

  const baseClass = displayMode ? 'math math-block' : 'math math-inline'

  switch (state.status) {
    case 'loading':
      return (
        <span className={`${baseClass} math-loading`}>
          {source}
        </span>
      )

    case 'rendered':
      if (displayMode) {
        return (
          <div
            className={baseClass}
            dangerouslySetInnerHTML={{ __html: state.html }}
          />
        )
      }
      return (
        <span
          className={baseClass}
          dangerouslySetInnerHTML={{ __html: state.html }}
        />
      )

    case 'error':
      if (displayMode) {
        return (
          <div className={`${baseClass} math-error`} title={state.message}>
            {source}
          </div>
        )
      }
      return (
        <span className={`${baseClass} math-error`} title={state.message}>
          {source}
        </span>
      )

    case 'timeout':
      if (displayMode) {
        return (
          <div className={`${baseClass} math-error`} title={t('math.renderTimeout')}>
            {source}
          </div>
        )
      }
      return (
        <span className={`${baseClass} math-error`} title={t('math.renderTimeout')}>
          {source}
        </span>
      )

    case 'load-failed':
      if (displayMode) {
        return (
          <div className={`${baseClass} math-load-failed`}>
            {source}
          </div>
        )
      }
      return (
        <span className={`${baseClass} math-load-failed`}>
          {source}
        </span>
      )
  }
}
