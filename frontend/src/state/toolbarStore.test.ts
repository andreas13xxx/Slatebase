import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  resolveOrder,
  moveWithin,
  moveToIndexOf,
  getToolbarPrefs,
  setToolbarVisible,
  toggleToolbarVisible,
  setToolbarPosition,
  setToolbarOrder,
  setEntryHidden,
  toggleEntryHidden,
  isEntryHidden,
  setEntryColor,
  moveEntry,
  reorderEntry,
  resetToolbarLayout,
  __resetToolbarStoreForTests,
  DEFAULT_TOOLBAR_PREFS,
} from './toolbarStore'

const STORAGE_KEY = 'slatebase:toolbar'

beforeEach(() => {
  __resetToolbarStoreForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resolveOrder', () => {
  it('keeps the persisted order for ids that still exist', () => {
    expect(resolveOrder(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b'])
  })

  it('drops persisted ids that are no longer present', () => {
    // e.g. an uninstalled plugin's ribbon icon, or an admin-only button for a
    // user who is no longer an admin
    expect(resolveOrder(['gone', 'a'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('appends present ids the persisted order does not know about', () => {
    expect(resolveOrder(['b'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c'])
  })

  it('ignores duplicates in the persisted order', () => {
    expect(resolveOrder(['a', 'a', 'b'], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('falls back to the natural order when nothing is persisted', () => {
    expect(resolveOrder([], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })
})

describe('moveWithin', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('moves one step towards the front', () => {
    expect(moveWithin(ids, 'c', 'up')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('moves one step towards the back', () => {
    expect(moveWithin(ids, 'b', 'down')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('moves to the start and to the end', () => {
    expect(moveWithin(ids, 'c', 'start')).toEqual(['c', 'a', 'b', 'd'])
    expect(moveWithin(ids, 'b', 'end')).toEqual(['a', 'c', 'd', 'b'])
  })

  it('returns the input unchanged at the edges', () => {
    expect(moveWithin(ids, 'a', 'up')).toBe(ids)
    expect(moveWithin(ids, 'd', 'down')).toBe(ids)
    expect(moveWithin(ids, 'a', 'start')).toBe(ids)
    expect(moveWithin(ids, 'd', 'end')).toBe(ids)
  })

  it('returns the input unchanged for an unknown id', () => {
    expect(moveWithin(ids, 'zzz', 'up')).toBe(ids)
  })
})

describe('moveToIndexOf', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('drops the dragged entry into the target slot', () => {
    expect(moveToIndexOf(ids, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moveToIndexOf(ids, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('is a no-op when dragging onto itself or an unknown target', () => {
    expect(moveToIndexOf(ids, 'a', 'a')).toBe(ids)
    expect(moveToIndexOf(ids, 'a', 'zzz')).toBe(ids)
  })
})

describe('toolbar visibility and position', () => {
  it('defaults to a visible toolbar docked left', () => {
    expect(getToolbarPrefs()).toEqual(DEFAULT_TOOLBAR_PREFS)
  })

  it('toggles and persists visibility', () => {
    toggleToolbarVisible()
    expect(getToolbarPrefs().visible).toBe(false)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').visible).toBe(false)

    setToolbarVisible(true)
    expect(getToolbarPrefs().visible).toBe(true)
  })

  it('persists the docking side', () => {
    setToolbarPosition('right')
    expect(getToolbarPrefs().position).toBe('right')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').position).toBe('right')
  })
})

describe('per-entry visibility and colour', () => {
  it('hides and shows a single entry', () => {
    expect(isEntryHidden('graph')).toBe(false)
    toggleEntryHidden('graph')
    expect(isEntryHidden('graph')).toBe(true)
    toggleEntryHidden('graph')
    expect(isEntryHidden('graph')).toBe(false)
  })

  it('does not add duplicate hidden entries', () => {
    setEntryHidden('graph', true)
    setEntryHidden('graph', true)
    expect(getToolbarPrefs().hidden).toEqual(['graph'])
  })

  it('sets and clears a colour override', () => {
    setEntryColor('graph', '#ff0000')
    expect(getToolbarPrefs().colors.graph).toBe('#ff0000')
    setEntryColor('graph', null)
    expect(getToolbarPrefs().colors.graph).toBeUndefined()
  })

  it('treats plugin ribbon entries exactly like built-in ones', () => {
    const pluginId = 'plugin:my-plugin:Tagesübersicht'
    setEntryHidden(pluginId, true)
    setEntryColor(pluginId, '#22c55e')
    expect(isEntryHidden(pluginId)).toBe(true)
    expect(getToolbarPrefs().colors[pluginId]).toBe('#22c55e')
  })
})

describe('moveEntry / reorderEntry', () => {
  it('persists a move made against the visible order', () => {
    moveEntry('c', 'start', ['a', 'b', 'c'])
    expect(getToolbarPrefs().order).toEqual(['c', 'a', 'b'])
  })

  it('persists a drag-and-drop reorder', () => {
    reorderEntry('a', 'c', ['a', 'b', 'c'])
    expect(getToolbarPrefs().order).toEqual(['b', 'c', 'a'])
  })

  it('keeps entries that are hidden right now in their persisted slots', () => {
    // 'x' is hidden, so it never appears in the visible order handed to
    // moveEntry — but it must not be dropped from the persisted order either.
    setToolbarOrder(['a', 'x', 'b', 'c'])
    setEntryHidden('x', true)
    moveEntry('c', 'start', ['a', 'b', 'c'])
    expect(getToolbarPrefs().order).toEqual(['c', 'x', 'a', 'b'])
  })

  it('is a no-op at the edges', () => {
    setToolbarOrder(['a', 'b'])
    moveEntry('a', 'up', ['a', 'b'])
    expect(getToolbarPrefs().order).toEqual(['a', 'b'])
  })
})

describe('resetToolbarLayout', () => {
  it('clears order, hidden entries and colours but keeps visibility and side', () => {
    setToolbarPosition('right')
    setToolbarOrder(['b', 'a'])
    setEntryHidden('a', true)
    setEntryColor('b', '#ff0000')

    resetToolbarLayout()

    const prefs = getToolbarPrefs()
    expect(prefs.order).toEqual([])
    expect(prefs.hidden).toEqual([])
    expect(prefs.colors).toEqual({})
    expect(prefs.position).toBe('right')
    expect(prefs.visible).toBe(true)
  })
})

describe('storage robustness', () => {
  it('falls back to defaults for a corrupted payload', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')
    vi.resetModules()
    const fresh = await import('./toolbarStore')
    expect(fresh.getToolbarPrefs()).toEqual(DEFAULT_TOOLBAR_PREFS)
  })

  it('repairs individual malformed fields without discarding the valid ones', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      visible: 'nope',
      position: 'right',
      order: ['a', 7],
      hidden: 'nope',
      colors: { a: 1 },
    }))
    vi.resetModules()
    const fresh = await import('./toolbarStore')
    expect(fresh.getToolbarPrefs()).toEqual({
      visible: true,
      position: 'right',
      order: [],
      hidden: [],
      colors: {},
    })
  })

  it('survives localStorage throwing on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    expect(() => setToolbarPosition('right')).not.toThrow()
    expect(getToolbarPrefs().position).toBe('right')
  })
})
