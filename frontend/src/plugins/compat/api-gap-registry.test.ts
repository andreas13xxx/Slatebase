import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordGapRead,
  recordGapCall,
  getApiGaps,
  getApiGapsForPlugin,
  clearApiGaps,
  installApiGapInspector,
} from './api-gap-registry'

describe('api-gap-registry', () => {
  beforeEach(() => {
    clearApiGaps()
  })

  describe('recording', () => {
    it('reports the first read so the caller can warn once', () => {
      expect(recordGapRead('App', 'someApi', 'p1')).toBe(true)
      expect(recordGapRead('App', 'someApi', 'p1')).toBe(false)
      expect(recordGapRead('App', 'someApi', 'p1')).toBe(false)
    })

    it('counts reads and calls separately', () => {
      recordGapRead('App', 'someApi', 'p1')
      recordGapRead('App', 'someApi', 'p1')
      recordGapCall('App', 'someApi', 'p1')

      const [gap] = getApiGaps()
      expect(gap).toMatchObject({ property: 'someApi', reads: 2, calls: 1 })
    })

    it('keeps the same property separate per plugin', () => {
      recordGapRead('App', 'someApi', 'p1')
      recordGapRead('App', 'someApi', 'p2')

      expect(getApiGaps()).toHaveLength(2)
      expect(getApiGapsForPlugin('p1')).toHaveLength(1)
    })

    it('keeps the same property separate per shim', () => {
      recordGapRead('App', 'shared')
      recordGapRead('Workspace', 'shared')

      expect(getApiGaps().map((g) => g.shim)).toEqual(
        expect.arrayContaining(['App', 'Workspace']),
      )
    })

    it('attributes to "unknown" when no plugin is given, as for the shared Workspace', () => {
      recordGapRead('Workspace', 'someApi')

      expect(getApiGaps()[0]!.pluginId).toBe('unknown')
    })
  })

  describe('reporting', () => {
    it('ranks actually-called gaps above merely-read ones', () => {
      // A read alone is often harmless feature detection; a call means the
      // plugin expected something to happen.
      recordGapRead('App', 'onlyRead', 'p1')
      recordGapRead('App', 'onlyRead', 'p1')
      recordGapRead('App', 'onlyRead', 'p1')
      recordGapRead('App', 'alsoCalled', 'p1')
      recordGapCall('App', 'alsoCalled', 'p1')

      expect(getApiGaps().map((g) => g.property)).toEqual(['alsoCalled', 'onlyRead'])
    })

    it('starts empty and clears', () => {
      expect(getApiGaps()).toEqual([])

      recordGapRead('App', 'someApi', 'p1')
      expect(getApiGaps()).toHaveLength(1)

      clearApiGaps()
      expect(getApiGaps()).toEqual([])
    })
  })

  describe('installApiGapInspector', () => {
    it('exposes the getter on window', () => {
      installApiGapInspector()
      recordGapRead('App', 'someApi', 'p1')

      const inspect = (window as unknown as Record<string, unknown>)[
        '__slatebasePluginApiGaps'
      ] as () => unknown[]

      expect(inspect).toBeTypeOf('function')
      expect(inspect()).toHaveLength(1)
    })
  })
})
