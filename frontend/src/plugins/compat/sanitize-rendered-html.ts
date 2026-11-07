/**
 * Shared sanitizing step for the HTML the MarkdownRenderer shims build from
 * vault content, which any user with write access controls.
 *
 * DOMPurify's default allow-list keeps what the shims emit (`class`,
 * `data-href`, `href`, tables, `align`) and drops scripts, event
 * handlers and `javascript:` URLs.
 *
 * @module sanitize-rendered-html
 */

import DOMPurify from 'dompurify'
import { isSafeUrl } from './bases-values'

/** Sanitize an HTML string before it is assigned to `innerHTML`. */
export function sanitizeRenderedHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    // No inline CSS (UI redress / exfiltration via url()) and no forms; table
    // alignment is emitted as the `align` attribute by the shim instead.
    FORBID_TAGS: ['style', 'form'],
    FORBID_ATTR: ['style'],
  })
}

/** `url` if it passes the scheme allowlist (http/https/mailto/relative), else `fallback`. */
export function safeUrlOr(url: string, fallback: string): string {
  return isSafeUrl(url) ? url : fallback
}

/** Own DOMPurify instance for plugin icon SVGs, so the style hook never leaks into {@link sanitizeRenderedHtml}. */
const svgPurify = DOMPurify(window)

// `style` stays allowed: icon-font-style SVGs use `style="fill:..."` and our own
// sizing adds one. DOMPurify cannot judge CSS values, so drop any declaration
// that can fetch a resource or run code.
svgPurify.addHook('afterSanitizeAttributes', (node) => {
  const style = node.getAttribute?.('style')
  if (style && /url\s*\(|expression\s*\(|@import|javascript:|behavior\s*:|-moz-binding/i.test(style)) {
    node.removeAttribute('style')
  }
})

const SVG_WRAPPER_OPEN = '<svg xmlns="http://www.w3.org/2000/svg">'

/**
 * Sanitize a plugin-supplied icon (`addIcon()`): a full `<svg>` string or bare
 * inner markup. Removes scripts, event handlers, `foreignObject`, and
 * `href`/`xlink:href` that are not same-document fragments (`#id`); keeps
 * shapes, gradients, masks, clip paths and `viewBox`. Bare markup stays bare.
 */
export function sanitizeSvg(markup: string): string {
  const isFull = markup.trim().startsWith('<svg')
  const clean = svgPurify.sanitize(isFull ? markup : `${SVG_WRAPPER_OPEN}${markup}</svg>`, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'style', 'a', 'image', 'animate', 'set', 'animateTransform', 'animateMotion'],
    ADD_TAGS: ['use'], // safe: non-fragment hrefs are stripped below
    RETURN_DOM: true,
  }) as unknown as Element
  // Only same-document `#fragment` references survive.
  for (const el of Array.from(clean.querySelectorAll('*'))) {
    for (const attr of ['href', 'xlink:href']) {
      const v = el.getAttribute(attr)
      if (v !== null && !v.trim().startsWith('#')) el.removeAttribute(attr)
    }
  }
  const root = clean.querySelector('svg')
  if (!root) return ''
  return isFull ? root.outerHTML : root.innerHTML
}
