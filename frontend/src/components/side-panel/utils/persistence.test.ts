import { describe, it, expect, beforeEach, vi } from 'vitest'
import { savePanelLayout, loadPanelLayout } from './persistence'
import type { PersistedPanelLayout } from './persistence'

describe('side panel persistence utilities', () => {
  const PREFIX = 'slatebase_test_panel_'

  beforeEach(() => {
    localStorage.clear()
  })

  const validLayout: PersistedPanelLayout = {
    tabOrder: ['outline', 'links', 'tags', 'properties'],
    sections: [
      {
        viewIds: ['outline'],
        activeViewId: 'outline',
        heightFraction: 1,
      },
    ],
  }

  describe('savePanelLayout', () => {
    it('saves layout to localStorage with correct key', () => {
      savePanelLayout(PREFIX, 'user123', validLayout)

      const stored = localStorage.getItem(`${PREFIX}user123`)
      expect(stored).not.toBeNull()
      expect(JSON.parse(stored!)).toEqual(validLayout)
    })

    it('overwrites existing layout', () => {
      savePanelLayout(PREFIX, 'user123', validLayout)

      const newLayout: PersistedPanelLayout = {
        tabOrder: ['tags', 'links', 'outline', 'properties'],
        sections: [
          { viewIds: ['tags'], activeViewId: 'tags', heightFraction: 0.5 },
          { viewIds: ['links'], activeViewId: 'links', heightFraction: 0.5 },
        ],
      }

      savePanelLayout(PREFIX, 'user123', newLayout)

      const stored = localStorage.getItem(`${PREFIX}user123`)
      expect(JSON.parse(stored!)).toEqual(newLayout)
    })

    it('uses user-scoped key', () => {
      savePanelLayout(PREFIX, 'alice', validLayout)
      savePanelLayout(PREFIX, 'bob', validLayout)

      expect(localStorage.getItem(`${PREFIX}alice`)).not.toBeNull()
      expect(localStorage.getItem(`${PREFIX}bob`)).not.toBeNull()
    })

    it('uses prefix-scoped key so left and right panels stay independent', () => {
      savePanelLayout('slatebase_sidebar_panel_', 'user123', validLayout)
      savePanelLayout('slatebase_context_panel_', 'user123', validLayout)

      expect(localStorage.getItem('slatebase_sidebar_panel_user123')).not.toBeNull()
      expect(localStorage.getItem('slatebase_context_panel_user123')).not.toBeNull()
    })

    it('handles localStorage unavailability gracefully', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      expect(() => savePanelLayout(PREFIX, 'user123', validLayout)).not.toThrow()

      setItemSpy.mockRestore()
    })
  })

  describe('loadPanelLayout', () => {
    it('returns persisted layout for valid data', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify(validLayout))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toEqual(validLayout)
    })

    it('returns null when no data exists', () => {
      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null for corrupted JSON', () => {
      localStorage.setItem(`${PREFIX}user123`, '{invalid json')

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when tabOrder is missing', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({ sections: validLayout.sections }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when tabOrder is empty', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({ tabOrder: [], sections: validLayout.sections }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when tabOrder contains invalid view IDs', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({
        tabOrder: ['outline', 'invalid_view'],
        sections: validLayout.sections,
      }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('accepts a built-in view ID that only makes sense on the other side (explorer/favorites/recent)', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({
        tabOrder: ['outline', 'explorer'],
        sections: [{ viewIds: ['outline', 'explorer'], activeViewId: 'explorer', heightFraction: 1 }],
      }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).not.toBeNull()
      expect(result?.tabOrder).toEqual(['outline', 'explorer'])
    })

    it('accepts a plugin view ID', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({
        tabOrder: ['plugin:my-view'],
        sections: [{ viewIds: ['plugin:my-view'], activeViewId: 'plugin:my-view', heightFraction: 1 }],
      }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).not.toBeNull()
    })

    it('returns null when sections is missing', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({ tabOrder: validLayout.tabOrder }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when sections is empty', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({ tabOrder: validLayout.tabOrder, sections: [] }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when section has invalid viewIds', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({
        tabOrder: ['outline'],
        sections: [{ viewIds: ['not_a_view'], activeViewId: 'outline', heightFraction: 1 }],
      }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when section has empty viewIds', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({
        tabOrder: ['outline'],
        sections: [{ viewIds: [], activeViewId: 'outline', heightFraction: 1 }],
      }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when section has invalid activeViewId', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({
        tabOrder: ['outline'],
        sections: [{ viewIds: ['outline'], activeViewId: 'bogus', heightFraction: 1 }],
      }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when heightFraction is not a number', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({
        tabOrder: ['outline'],
        sections: [{ viewIds: ['outline'], activeViewId: 'outline', heightFraction: 'half' }],
      }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when heightFraction is zero', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({
        tabOrder: ['outline'],
        sections: [{ viewIds: ['outline'], activeViewId: 'outline', heightFraction: 0 }],
      }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when heightFraction is negative', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({
        tabOrder: ['outline'],
        sections: [{ viewIds: ['outline'], activeViewId: 'outline', heightFraction: -0.5 }],
      }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when heightFraction exceeds 1', () => {
      localStorage.setItem(`${PREFIX}user123`, JSON.stringify({
        tabOrder: ['outline'],
        sections: [{ viewIds: ['outline'], activeViewId: 'outline', heightFraction: 1.5 }],
      }))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when stored data is not an object', () => {
      localStorage.setItem(`${PREFIX}user123`, '"just a string"')

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('returns null when stored data is null JSON', () => {
      localStorage.setItem(`${PREFIX}user123`, 'null')

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()
    })

    it('handles localStorage unavailability gracefully', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError')
      })

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toBeNull()

      getItemSpy.mockRestore()
    })

    it('loads multi-section layout correctly', () => {
      const multiSectionLayout: PersistedPanelLayout = {
        tabOrder: ['links', 'tags', 'outline', 'properties'],
        sections: [
          { viewIds: ['links', 'tags'], activeViewId: 'links', heightFraction: 0.5 },
          { viewIds: ['outline'], activeViewId: 'outline', heightFraction: 0.3 },
          { viewIds: ['properties'], activeViewId: 'properties', heightFraction: 0.2 },
        ],
      }

      localStorage.setItem(`${PREFIX}user123`, JSON.stringify(multiSectionLayout))

      const result = loadPanelLayout(PREFIX, 'user123')
      expect(result).toEqual(multiSectionLayout)
    })
  })

  describe('round-trip', () => {
    it('save then load returns identical layout', () => {
      const layout: PersistedPanelLayout = {
        tabOrder: ['properties', 'tags', 'links', 'outline'],
        sections: [
          { viewIds: ['properties', 'tags'], activeViewId: 'tags', heightFraction: 0.6 },
          { viewIds: ['links', 'outline'], activeViewId: 'outline', heightFraction: 0.4 },
        ],
      }

      savePanelLayout(PREFIX, 'user42', layout)
      const loaded = loadPanelLayout(PREFIX, 'user42')

      expect(loaded).toEqual(layout)
    })
  })
})
