/**
 * Shared URL parsing for the Web Viewer tab and the inline web embed (R4).
 * Kept out of the component files so each only exports a component
 * (react-refresh/only-export-components).
 */

/** Parses a URL and reports whether it is a safe http(s) target plus a display host. */
export function parseWebUrl(raw: string): { valid: boolean; displayUrl: string } {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { valid: false, displayUrl: raw }
    }
    const display = url.hostname + (url.pathname !== '/' ? url.pathname : '')
    return { valid: true, displayUrl: display }
  } catch {
    return { valid: false, displayUrl: raw }
  }
}
