/**
 * Whether `url` is an absolute http(s) URL (case-insensitive, surrounding
 * whitespace ignored). Everything else (`javascript:`, `data:`, `vbscript:`,
 * relative vault paths, ...) is not safe to hand to `window.open`.
 */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

/**
 * Opens `url` in a new tab with `noopener,noreferrer`, but only when it is an
 * http(s) URL. Returns whether it was opened; callers decide what to do with
 * non-http(s) values (route as internal link, or ignore).
 */
export function openExternalUrl(url: string): boolean {
  if (!isHttpUrl(url)) return false
  window.open(url.trim(), '_blank', 'noopener,noreferrer')
  return true
}
