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
