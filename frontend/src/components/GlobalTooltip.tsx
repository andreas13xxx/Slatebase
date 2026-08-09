/**
 * Renders a visible tooltip for any element carrying an `aria-label`.
 *
 * Obsidian treats `aria-label` as its tooltip mechanism: the host renders a
 * bubble on hover/focus, so plugins (and our own compat layer's
 * `setTooltip()`, see obsidian-api-extensions.ts) just set the attribute and
 * expect it to become visible. Browsers don't do that on their own — only
 * `title` gets a native tooltip — so without this, every aria-label tooltip
 * in the app, core UI included, is silently invisible.
 *
 * Mounted once near the root (see App.tsx), independent of vault/auth state,
 * so it covers the whole app the same way Obsidian's tooltip layer does.
 *
 * @module GlobalTooltip
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { placeGlobalTooltip, type TooltipPlacement } from './global-tooltip-position'
import './GlobalTooltip.css'

/** How long the pointer/focus must rest before the tooltip appears. */
const SHOW_DELAY_MS = 300

interface TooltipTarget {
  el: HTMLElement
  label: string
}

export function GlobalTooltip() {
  const [target, setTarget] = useState<TooltipTarget | null>(null)
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentEl = useRef<HTMLElement | null>(null)

  // Track hover/focus globally rather than per-element, since the labelled
  // elements are largely plugin-rendered DOM outside React's tree.
  useEffect(() => {
    const clearShowTimer = (): void => {
      if (showTimer.current) {
        clearTimeout(showTimer.current)
        showTimer.current = null
      }
    }

    const dismiss = (): void => {
      clearShowTimer()
      currentEl.current = null
      setTarget(null)
      setPlacement(null)
    }

    const resolveTarget = (source: EventTarget | null): HTMLElement | null => {
      if (!(source instanceof Element)) return null
      const el = source.closest<HTMLElement>('[aria-label]')
      if (!el) return null
      const label = el.getAttribute('aria-label')
      return label && label.trim() ? el : null
    }

    const activate = (el: HTMLElement | null): void => {
      if (el === currentEl.current) return
      clearShowTimer()
      currentEl.current = el
      setTarget(null)
      setPlacement(null)
      if (!el) return
      showTimer.current = setTimeout(() => {
        // The element can be gone by the time the delay elapses (a re-render
        // swapped it out, a plugin tore down its UI). Checking here rather
        // than at measurement time keeps the effect below free of setState.
        if (!el.isConnected) {
          currentEl.current = null
          return
        }
        setTarget({ el, label: el.getAttribute('aria-label') ?? '' })
      }, SHOW_DELAY_MS)
    }

    const onOver = (e: MouseEvent): void => activate(resolveTarget(e.target))

    const onOut = (e: MouseEvent): void => {
      const el = currentEl.current
      if (!el) return
      const related = e.relatedTarget
      if (!(related instanceof Node) || !el.contains(related)) dismiss()
    }

    const onFocusIn = (e: FocusEvent): void => activate(resolveTarget(e.target))

    const onFocusOut = (e: FocusEvent): void => {
      const el = currentEl.current
      if (!el) return
      const related = e.relatedTarget
      if (!(related instanceof Node) || !el.contains(related)) dismiss()
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dismiss()
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('blur', dismiss)

    return () => {
      clearShowTimer()
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('blur', dismiss)
    }
  }, [])

  // Position once the tooltip has a measurable size.
  useLayoutEffect(() => {
    if (!target || !tooltipRef.current) return
    // Narrow race: the target went away between the show timer firing and this
    // measurement. Leaving `placement` null keeps the tooltip `visibility:
    // hidden` (so it stays out of the accessibility tree too) until the next
    // hover/focus resolves a live target.
    if (!target.el.isConnected) return
    const anchor = target.el.getBoundingClientRect()
    const box = tooltipRef.current.getBoundingClientRect()
    setPlacement(
      placeGlobalTooltip(
        { top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height },
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    )
  }, [target])

  if (!target) return null

  return (
    <div
      ref={tooltipRef}
      // `tooltip` is Obsidian's class for this element; plugin stylesheets
      // restyle tooltips through it, and would not match our own name.
      className={`tooltip global-tooltip global-tooltip--${placement?.side ?? 'above'}`}
      // Hidden until measured, so it never flashes at the wrong position.
      style={{
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        visibility: placement ? 'visible' : 'hidden',
      }}
      role="tooltip"
    >
      {target.label}
    </div>
  )
}
