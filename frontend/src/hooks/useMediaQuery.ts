/**
 * Window-width breakpoints for layout decisions.
 *
 * `useBreakpoint()` measures the WINDOW (how much room the layout has); `Platform.isPhone/isTablet`
 * (`plugins/compat/platform-detection.ts`) measures the DEVICE (whether touch gestures make sense). A
 * desktop browser in a narrow window is `mobile` here but not a phone there — keep the two apart.
 *
 * The numbers live in ONE place for CSS and JS: `App.css` documents the same values in its header, and
 * every `@media (max-width: …)` rule must use them. Change them in both places or not at all.
 *
 * @module hooks/useMediaQuery
 */
import { useSyncExternalStore } from 'react'

/** Upper bounds (inclusive, px) of the `mobile` and `tablet` ranges; anything wider is `desktop`. */
export const BREAKPOINTS = {
  /** `mobile`: up to 767 px (below 768). */
  mobile: 767,
  /** `tablet`: 768 to 1024 px. */
  tablet: 1024,
} as const

/** The layout range of the current window width. */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

/** Media queries matching the ranges above (kept next to the numbers so JS and CSS read alike). */
export const BREAKPOINT_QUERIES = {
  mobile: `(max-width: ${BREAKPOINTS.mobile}px)`,
  tablet: `(max-width: ${BREAKPOINTS.tablet}px)`,
} as const

/** `window.matchMedia`, or `null` where it does not exist (jsdom, very old browsers). */
function getMatchMedia(): ((query: string) => MediaQueryList) | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null
}

/**
 * Subscribes to a CSS media query and returns whether it currently matches. Without `matchMedia`
 * (jsdom) it is always `false`, so a component renders its desktop form there.
 *
 * @param query - A media query such as `(max-width: 767px)`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = getMatchMedia()?.(query)
      mql?.addEventListener('change', onChange)
      return () => mql?.removeEventListener('change', onChange)
    },
    () => getMatchMedia()?.(query).matches ?? false,
    () => false,
  )
}

/** The layout range of the current window: `mobile` (< 768 px), `tablet` (768–1024 px) or `desktop`. */
export function useBreakpoint(): Breakpoint {
  const isMobile = useMediaQuery(BREAKPOINT_QUERIES.mobile)
  const isTablet = useMediaQuery(BREAKPOINT_QUERIES.tablet)
  return isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop'
}
