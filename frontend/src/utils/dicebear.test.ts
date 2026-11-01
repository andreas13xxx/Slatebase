import { describe, it, expect } from 'vitest'
import {
  dicebearUrl,
  dicebearSeeds,
  DICEBEAR_STYLES,
  DICEBEAR_HOST,
  DICEBEAR_VERSION,
} from './dicebear'

describe('dicebearUrl', () => {
  it('builds an https api.dicebear.com svg URL for a style + seed', () => {
    expect(dicebearUrl('bottts', 'andreas')).toBe(
      `https://${DICEBEAR_HOST}/${DICEBEAR_VERSION}/bottts/svg?seed=andreas`,
    )
  })

  it('strips unsafe characters from the seed before encoding', () => {
    // Spaces, &, <, quotes etc. are removed so nothing user-controlled reaches the URL.
    expect(dicebearUrl('lorelei', 'a b&c')).toBe(
      `https://${DICEBEAR_HOST}/${DICEBEAR_VERSION}/lorelei/svg?seed=abc`,
    )
    expect(dicebearUrl('lorelei', '"><img>')).toBe(
      `https://${DICEBEAR_HOST}/${DICEBEAR_VERSION}/lorelei/svg?seed=img`,
    )
  })

  it('keeps safe identifier characters', () => {
    expect(dicebearUrl('bottts', 'andreas-1.foo_bar')).toBe(
      `https://${DICEBEAR_HOST}/${DICEBEAR_VERSION}/bottts/svg?seed=andreas-1.foo_bar`,
    )
  })

  it('falls back to a default seed when nothing safe remains', () => {
    expect(dicebearUrl('icons', '世界')).toBe(
      `https://${DICEBEAR_HOST}/${DICEBEAR_VERSION}/icons/svg?seed=avatar`,
    )
  })

  it('produces a URL that parses to the allowlisted host over https', () => {
    const parsed = new URL(dicebearUrl('icons', 'x'))
    expect(parsed.protocol).toBe('https:')
    expect(parsed.hostname).toBe('api.dicebear.com')
  })

  it('builds a valid URL for every curated style', () => {
    for (const style of DICEBEAR_STYLES) {
      const parsed = new URL(dicebearUrl(style, 'seed'))
      expect(parsed.hostname).toBe('api.dicebear.com')
      expect(parsed.pathname.endsWith('/svg')).toBe(true)
    }
  })
})

describe('dicebearSeeds', () => {
  it('returns the requested count with the base first', () => {
    const seeds = dicebearSeeds('andreas', 4)
    expect(seeds).toHaveLength(4)
    expect(seeds[0]).toBe('andreas')
    expect(seeds[1]).toBe('andreas-1')
  })

  it('is deterministic for the same base', () => {
    expect(dicebearSeeds('bob')).toEqual(dicebearSeeds('bob'))
  })
})
