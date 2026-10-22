/**
 * Pure helpers for the Bases Map view — coordinate parsing and the view's
 * geo-property convention. Kept out of the component file so they are testable
 * without a DOM/Leaflet and so the component file has a single component export
 * (react-refresh rule).
 */

import type { BaseRow, BaseView } from '@slatebase/shared-contracts'

/** First scalar value of a row property as a string ('' when absent). */
export function firstValue(row: BaseRow, key: string): string {
  if (key === 'file.name') return row.fileName
  const v = row.values[key]
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : ''
  if (v === undefined || v === null) return ''
  return String(v)
}

/** A finite latitude in [-90, 90], else null. */
export function toLat(value: string): number | null {
  const n = Number(value.trim())
  return value.trim() !== '' && Number.isFinite(n) && n >= -90 && n <= 90 ? n : null
}

/** A finite longitude in [-180, 180], else null. */
export function toLng(value: string): number | null {
  const n = Number(value.trim())
  return value.trim() !== '' && Number.isFinite(n) && n >= -180 && n <= 180 ? n : null
}

export interface MapConfig {
  /** Single property holding `"lat,lng"`, or null when using two properties. */
  pairProperty: string | null
  /** Separate lat/lng property names (used when pairProperty is null). */
  latProperty: string
  lngProperty: string
}

/**
 * Read the coordinate convention from the view's config, with fallbacks:
 *   - `coordinates`: one property holding `"lat,lng"`.
 *   - `latProperty` / `lngProperty`: two numeric properties (default `lat`/`lng`).
 *   - neither configured → default to a `location` pair property.
 */
export function readMapConfig(view: BaseView): MapConfig {
  const u = view._unknown ?? {}
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const pairProperty = str(u['coordinates']) ?? null
  const latProperty = str(u['latProperty']) ?? 'lat'
  const lngProperty = str(u['lngProperty']) ?? 'lng'
  if (!pairProperty && !str(u['latProperty']) && !str(u['lngProperty'])) {
    return { pairProperty: 'location', latProperty, lngProperty }
  }
  return { pairProperty, latProperty, lngProperty }
}

export interface Pin {
  lat: number
  lng: number
  label: string
  path: string
}

/** Extract plottable pins from the rows per the coordinate convention. */
export function extractPins(rows: BaseRow[], cfg: MapConfig): { pins: Pin[]; skipped: number } {
  const pins: Pin[] = []
  let skipped = 0
  for (const row of rows) {
    let lat: number | null = null
    let lng: number | null = null
    if (cfg.pairProperty) {
      const raw = firstValue(row, cfg.pairProperty)
      const parts = raw.split(',')
      if (parts.length === 2) {
        lat = toLat(parts[0] ?? '')
        lng = toLng(parts[1] ?? '')
      }
      if (lat === null || lng === null) {
        const la = toLat(firstValue(row, cfg.latProperty))
        const ln = toLng(firstValue(row, cfg.lngProperty))
        if (la !== null && ln !== null) { lat = la; lng = ln }
      }
    } else {
      lat = toLat(firstValue(row, cfg.latProperty))
      lng = toLng(firstValue(row, cfg.lngProperty))
    }
    if (lat === null || lng === null) { skipped += 1; continue }
    pins.push({ lat, lng, label: row.fileName, path: row.path })
  }
  return { pins, skipped }
}
