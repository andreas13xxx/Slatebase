import type { PublicEmbedView } from './types'

/** Absolute URL of a public page for the given path (`/s/<token>`). */
export function linkUrl(path: string): string {
  return `${window.location.origin}${path}`
}

/** `yyyy-mm-dd` from a date input → ISO timestamp at the end of that day in the user's time zone. */
export function toExpiryIso(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 23, 59, 59).toISOString()
}

/** Date and time in the user's locale, or the raw text if it is not a valid date. */
export function formatShareDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

/** German label for the kind of an embed in the sharing preview. */
export function kindLabel(kind: PublicEmbedView['kind']): string {
  switch (kind) {
    case 'note': return 'Notiz'
    case 'asset': return 'Datei'
    case 'unavailable': return 'nicht verfügbar'
  }
}
