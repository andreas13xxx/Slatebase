import { describe, it, expect, beforeEach, vi } from 'vitest'
import { savePanelLayout, loadPanelLayout, saveBasePanelPath, loadBasePanelPath } from './persistence'
import type { PersistedPanelLayout } from './persistence'
import {
  _reset as resetVaultSettings,
  setActiveVault,
  updateVaultSettings,
} from '../../../state/vaultSettingsStore'

vi.mock('../../ToastNotification', () => ({ showToast: vi.fn() }))

describe('side panel persistence utilities', () => {
  beforeEach(async () => {
    // Layouts live in the active vault's settings now, not in localStorage.
    resetVaultSettings()
    await setActiveVault('vault-1')
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

  /** Seeds a raw (possibly invalid) payload as the right panel's stored layout. */
  function seed(raw: unknown): void {
    updateVaultSettings({ contextPanel: raw as Record<string, unknown> | null })
  }

  describe('savePanelLayout', () => {
    it('saves a layout that loadPanelLayout reads back', () => {
      savePanelLayout('context', validLayout)
      expect(loadPanelLayout('context')).toMatchObject(validLayout)
    })

    it('overwrites an existing layout', () => {
      savePanelLayout('context', validLayout)

      const updated: PersistedPanelLayout = {
        tabOrder: ['links'],
        sections: [{ viewIds: ['links'], activeViewId: 'links', heightFraction: 1 }],
      }
      savePanelLayout('context', updated)

      expect(loadPanelLayout('context')).toMatchObject(updated)
    })

    it('keeps the left and right panels independent', () => {
      const leftLayout: PersistedPanelLayout = {
        tabOrder: ['explorer'],
        sections: [{ viewIds: ['explorer'], activeViewId: 'explorer', heightFraction: 1 }],
      }
      savePanelLayout('context', validLayout)
      savePanelLayout('sidebar', leftLayout)

      expect(loadPanelLayout('context')).toMatchObject(validLayout)
      expect(loadPanelLayout('sidebar')).toEqual(leftLayout)
    })

    it('keeps layouts separate per vault', async () => {
      savePanelLayout('context', validLayout)
      expect(loadPanelLayout('context')).toMatchObject(validLayout)

      await setActiveVault('vault-2')

      expect(loadPanelLayout('context')).toBeNull()
    })
  })

  describe('loadPanelLayout', () => {
    it('returns the persisted layout for valid data', () => {
      seed(validLayout)
      expect(loadPanelLayout('context')).toMatchObject(validLayout)
    })

    it('returns null when nothing is stored', () => {
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('returns null when tabOrder is missing', () => {
      seed({ sections: validLayout.sections })
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('returns null when tabOrder is empty', () => {
      seed({ tabOrder: [], sections: validLayout.sections })
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('returns null when tabOrder contains invalid view IDs', () => {
      seed({ tabOrder: ['outline', 'bogus'], sections: validLayout.sections })
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('accepts a built-in view ID that belongs to the other side', () => {
      const layout: PersistedPanelLayout = {
        tabOrder: ['explorer', 'favorites', 'recent'],
        sections: [{ viewIds: ['explorer'], activeViewId: 'explorer', heightFraction: 1 }],
      }
      seed(layout)
      expect(loadPanelLayout('context')).toEqual(layout)
    })

    it('accepts a plugin view ID', () => {
      const layout: PersistedPanelLayout = {
        tabOrder: ['plugin:my-plugin-view'],
        sections: [{
          viewIds: ['plugin:my-plugin-view'],
          activeViewId: 'plugin:my-plugin-view',
          heightFraction: 1,
        }],
      }
      seed(layout)
      expect(loadPanelLayout('context')).toEqual(layout)
    })

    it('returns null when sections is missing', () => {
      seed({ tabOrder: validLayout.tabOrder })
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('returns null when sections is empty', () => {
      seed({ tabOrder: validLayout.tabOrder, sections: [] })
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('returns null when a section has invalid viewIds', () => {
      seed({
        tabOrder: validLayout.tabOrder,
        sections: [{ viewIds: ['bogus'], activeViewId: 'outline', heightFraction: 1 }],
      })
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('returns null when a section has empty viewIds', () => {
      seed({
        tabOrder: validLayout.tabOrder,
        sections: [{ viewIds: [], activeViewId: 'outline', heightFraction: 1 }],
      })
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('returns null when a section has an invalid activeViewId', () => {
      seed({
        tabOrder: validLayout.tabOrder,
        sections: [{ viewIds: ['outline'], activeViewId: 'bogus', heightFraction: 1 }],
      })
      expect(loadPanelLayout('context')).toBeNull()
    })

    it.each([
      ['not a number', 'high'],
      ['zero', 0],
      ['negative', -0.5],
      ['greater than 1', 1.5],
    ])('returns null when heightFraction is %s', (_label, heightFraction) => {
      seed({
        tabOrder: validLayout.tabOrder,
        sections: [{ viewIds: ['outline'], activeViewId: 'outline', heightFraction }],
      })
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('returns null when the stored value is not an object', () => {
      seed('nope')
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('returns null when the stored value is cleared', () => {
      seed(null)
      expect(loadPanelLayout('context')).toBeNull()
    })

    it('accepts a footnotes, activity or base built-in view ID (previously rejected as corrupt)', () => {
      for (const viewId of ['footnotes', 'activity', 'base'] as const) {
        const layout: PersistedPanelLayout = {
          tabOrder: [viewId],
          sections: [{ viewIds: [viewId], activeViewId: viewId, heightFraction: 1 }],
        }
        seed(layout)
        expect(loadPanelLayout('context')).toEqual(layout)
      }
    })

    it('loads a multi-section layout correctly', () => {
      const multiSection: PersistedPanelLayout = {
        tabOrder: ['outline', 'links', 'tags'],
        sections: [
          { viewIds: ['outline'], activeViewId: 'outline', heightFraction: 0.5 },
          { viewIds: ['links', 'tags'], activeViewId: 'links', heightFraction: 0.5 },
        ],
      }
      seed(multiSection)
      expect(loadPanelLayout('context')).toEqual(multiSection)
    })
  })

  describe('round-trip', () => {
    it('save then load returns an identical layout', () => {
      const layout: PersistedPanelLayout = {
        tabOrder: ['outline', 'links', 'tags', 'properties', 'search'],
        sections: [
          { viewIds: ['outline', 'links'], activeViewId: 'links', heightFraction: 0.6 },
          { viewIds: ['tags'], activeViewId: 'tags', heightFraction: 0.4 },
        ],
      }
      savePanelLayout('context', layout)
      expect(loadPanelLayout('context')).toEqual(layout)
    })
  })

  describe('saveBasePanelPath / loadBasePanelPath', () => {
    it('keeps the pinned path across a layout save without keeping other stale keys', () => {
      saveBasePanelPath('context', 'a.base')
      savePanelLayout('context', { tabOrder: ['outline'], sections: [{ viewIds: ['outline'], activeViewId: 'outline', heightFraction: 1 }] })
      expect(loadBasePanelPath('context')).toBe('a.base')
    })

    it('returns null when nothing is pinned', () => {
      expect(loadBasePanelPath('context')).toBeNull()
    })

    it('round-trips a pinned path, independently per side', () => {
      saveBasePanelPath('context', 'Dashboards/Tasks.base')
      saveBasePanelPath('sidebar', 'Dashboards/Other.base')
      expect(loadBasePanelPath('context')).toBe('Dashboards/Tasks.base')
      expect(loadBasePanelPath('sidebar')).toBe('Dashboards/Other.base')
    })

    it('clears a pinned path with null', () => {
      saveBasePanelPath('context', 'Dashboards/Tasks.base')
      saveBasePanelPath('context', null)
      expect(loadBasePanelPath('context')).toBeNull()
    })

    it('survives a layout save made before or after it, in either order', () => {
      saveBasePanelPath('context', 'Dashboards/Tasks.base')
      savePanelLayout('context', validLayout)
      expect(loadBasePanelPath('context')).toBe('Dashboards/Tasks.base')
      expect(loadPanelLayout('context')).toMatchObject(validLayout)

      saveBasePanelPath('context', 'Dashboards/Other.base')
      expect(loadBasePanelPath('context')).toBe('Dashboards/Other.base')
      expect(loadPanelLayout('context')).toMatchObject(validLayout)
    })

    it('a second layout save keeps a path pinned earlier', () => {
      savePanelLayout('context', validLayout)
      saveBasePanelPath('context', 'Dashboards/Tasks.base')
      const updated: PersistedPanelLayout = {
        tabOrder: ['links'],
        sections: [{ viewIds: ['links'], activeViewId: 'links', heightFraction: 1 }],
      }
      savePanelLayout('context', updated)
      expect(loadBasePanelPath('context')).toBe('Dashboards/Tasks.base')
      expect(loadPanelLayout('context')).toMatchObject(updated)
    })
  })
})
