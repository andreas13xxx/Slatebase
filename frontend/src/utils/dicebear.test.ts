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

  it('URL-encodes the seed', () => {
    expect(dicebearUrl('lorelei', 'a b&c')).toBe(
      `https://${DICEBEAR_HOST}/${DICEBEAR_VERSION}/lorelei/svg?seed=a%20b%26c`,
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
