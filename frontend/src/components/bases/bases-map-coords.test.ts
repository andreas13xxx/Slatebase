import { describe, it, expect } from 'vitest'
import type { BaseRow, BaseView } from '@slatebase/shared-contracts'
import { readMapConfig, extractPins, toLat, toLng } from './bases-map-coords'

function row(fileName: string, values: Record<string, unknown>): BaseRow {
  return { path: `${fileName}.md`, fileName, values }
}

describe('readMapConfig', () => {
  it('defaults to a "location" pair property when nothing is configured', () => {
    const view: BaseView = { type: 'map' }
    expect(readMapConfig(view)).toEqual({ pairProperty: 'location', latProperty: 'lat', lngProperty: 'lng' })
  })

  it('reads an explicit pair property from the view config', () => {
    const view: BaseView = { type: 'map', _unknown: { coordinates: 'geo' } }
    expect(readMapConfig(view).pairProperty).toBe('geo')
  })

  it('reads explicit separate lat/lng properties and drops the pair default', () => {
    const view: BaseView = { type: 'map', _unknown: { latProperty: 'breite', lngProperty: 'laenge' } }
    expect(readMapConfig(view)).toEqual({ pairProperty: null, latProperty: 'breite', lngProperty: 'laenge' })
  })
})

describe('toLat / toLng', () => {
  it('accepts in-range values', () => {
    expect(toLat('52.52')).toBe(52.52)
    expect(toLng('13.405')).toBe(13.405)
    expect(toLat('-90')).toBe(-90)
    expect(toLng('180')).toBe(180)
  })

  it('rejects out-of-range, empty and non-numeric values', () => {
    expect(toLat('91')).toBeNull()
    expect(toLng('181')).toBeNull()
    expect(toLat('')).toBeNull()
    expect(toLng('abc')).toBeNull()
  })
})

describe('extractPins', () => {
  it('plots a pair-property "lat,lng" value', () => {
    const cfg = readMapConfig({ type: 'map', _unknown: { coordinates: 'loc' } })
    const { pins, skipped } = extractPins([row('Berlin', { loc: '52.52, 13.405' })], cfg)
    expect(skipped).toBe(0)
    expect(pins).toEqual([{ lat: 52.52, lng: 13.405, label: 'Berlin', path: 'Berlin.md' }])
  })

  it('plots separate lat/lng properties', () => {
    const cfg = readMapConfig({ type: 'map', _unknown: { latProperty: 'la', lngProperty: 'ln' } })
    const { pins, skipped } = extractPins([row('Paris', { la: 48.8566, ln: 2.3522 })], cfg)
    expect(skipped).toBe(0)
    expect(pins[0]).toMatchObject({ lat: 48.8566, lng: 2.3522, label: 'Paris' })
  })

  it('falls back to separate lat/lng when the pair property is missing', () => {
    const cfg = readMapConfig({ type: 'map', _unknown: { coordinates: 'loc' } })
    // loc absent, but lat/lng present → fallback plots it.
    const { pins } = extractPins([row('Rome', { lat: 41.9, lng: 12.5 })], cfg)
    expect(pins).toHaveLength(1)
    expect(pins[0]).toMatchObject({ lat: 41.9, lng: 12.5 })
  })

  it('skips rows with no / unparseable coordinates and counts them', () => {
    const cfg = readMapConfig({ type: 'map', _unknown: { coordinates: 'loc' } })
    const { pins, skipped } = extractPins(
      [row('Good', { loc: '1,2' }), row('NoCoord', {}), row('Bad', { loc: 'x,y' })],
      cfg,
    )
    expect(pins).toHaveLength(1)
    expect(skipped).toBe(2)
  })
})
