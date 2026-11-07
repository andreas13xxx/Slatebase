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

/** Own DOMPurify instance for plugin icon SVGs, so its config never leaks into {@link sanitizeRenderedHtml}. */
const svgPurify = DOMPurify(window)

const SVG_WRAPPER_OPEN = '<svg xmlns="http://www.w3.org/2000/svg">'

/**
 * Sanitize a plugin-supplied icon (`addIcon()`) and return its `<svg>` root,
 * or `null` if nothing usable is left. `markup` is a full `<svg>` string or
 * bare inner markup (then wrapped in `wrapperOpen`, which callers pass
 * pre-built from trusted attributes).
 *
 * Removes scripts, event handlers, `foreignObject`, every `style` attribute
 * (CSS escapes such as `\75rl(` or `ur/**\/l(` defeat any value check), and
 * every `href`/`xlink:href` or `url(...)` paint reference that is not a
 * same-document `#fragment`.
 *
 * shortcut: `<style>` elements are dropped too, so Inkscape/Illustrator icons
 * that colour shapes via a `<style>.cls-1{...}</style>` block lose their
 * colours; upgrade by scoping and filtering CSS properly if that matters.
 */
export function sanitizeSvgElement(markup: string, wrapperOpen = SVG_WRAPPER_OPEN): Element | null {
  // Drop XML prolog, DOCTYPE and comments in front of the root.
  const body = markup.replace(/^(?:\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)+/i, '')
  const isFull = /^<svg[\s>/]/i.test(body)
  const clean = svgPurify.sanitize(isFull ? body : `${wrapperOpen}${body}</svg>`, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'style', 'a', 'image', 'animate', 'set', 'animateTransform', 'animateMotion'],
    FORBID_ATTR: ['style'],
    ADD_TAGS: ['use'], // safe: non-fragment hrefs are stripped below
    RETURN_DOM: true,
  }) as unknown as Element
  for (const el of Array.from(clean.querySelectorAll('*'))) {
    for (const attr of ['href', 'xlink:href']) {
      const v = el.getAttribute(attr)
      if (v !== null && !v.trim().startsWith('#')) el.removeAttribute(attr)
    }
    // Presentation attributes (fill, filter, mask, ...) may reference only `url(#id)`.
    for (const attr of Array.from(el.attributes)) {
      if (/url\s*\(\s*(?!['"]?\s*#)/i.test(attr.value)) el.removeAttribute(attr.name)
    }
  }
  return clean.querySelector('svg')
}

/** String form of {@link sanitizeSvgElement}; bare inner markup stays bare. */
export function sanitizeSvg(markup: string): string {
  const root = sanitizeSvgElement(markup)
  if (!root) return ''
  return /^(?:\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*<svg[\s>/]/i.test(markup) ? root.outerHTML : root.innerHTML
}
