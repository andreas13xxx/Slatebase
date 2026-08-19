import { describe, it, expect } from 'vitest'
import {
  panelReducer,
  createInitialState,
  isPluginViewId,
  isBuiltinViewId,
  getPluginViewType,
  type PanelState,
} from './panelState'

describe('isPluginViewId / isBuiltinViewId / getPluginViewType', () => {
  it('identifies plugin view IDs', () => {
    expect(isPluginViewId('plugin:my-view')).toBe(true)
    expect(isPluginViewId('explorer')).toBe(false)
  })

  it('identifies all 8 built-in view IDs, usable on either side', () => {
    expect(isBuiltinViewId('explorer')).toBe(true)
    expect(isBuiltinViewId('favorites')).toBe(true)
    expect(isBuiltinViewId('recent')).toBe(true)
    expect(isBuiltinViewId('outline')).toBe(true)
    expect(isBuiltinViewId('links')).toBe(true)
    expect(isBuiltinViewId('tags')).toBe(true)
    expect(isBuiltinViewId('properties')).toBe(true)
    expect(isBuiltinViewId('search')).toBe(true)
    expect(isBuiltinViewId('plugin:my-view')).toBe(false)
  })

  it('extracts the view type from a plugin view ID', () => {
    expect(getPluginViewType('plugin:my-view')).toBe('my-view')
  })
})

describe('createInitialState', () => {
  it('seeds sections/tabOrder from the given default view IDs (side-specific only at this point)', () => {
    const left = createInitialState(['explorer', 'favorites', 'recent'])
    const right = createInitialState(['outline', 'links', 'tags', 'properties', 'search'])

    expect(left.tabOrder).toEqual(['explorer', 'favorites', 'recent'])
    expect(left.sections[0]!.activeViewId).toBe('explorer')
    expect(right.tabOrder).toEqual(['outline', 'links', 'tags', 'properties', 'search'])
    expect(right.sections[0]!.activeViewId).toBe('outline')
  })
})

describe('panelReducer', () => {
  describe('ADD_VIEW', () => {
    it('adds a plugin view to the first section and tab order', () => {
      const state = createInitialState(['explorer'])

      const next = panelReducer(state, { type: 'ADD_VIEW', viewId: 'plugin:my-view' })

      expect(next.sections[0]!.viewIds).toContain('plugin:my-view')
      expect(next.tabOrder).toContain('plugin:my-view')
    })

    it('adds a built-in view that started on the other side (cross-panel move)', () => {
      const state = createInitialState(['outline'])

      const next = panelReducer(state, { type: 'ADD_VIEW', viewId: 'explorer' })

      expect(next.sections[0]!.viewIds).toContain('explorer')
      expect(next.tabOrder).toContain('explorer')
    })

    it('is a no-op if the view is already present', () => {
      const state = createInitialState(['explorer'])
      const withView = panelReducer(state, { type: 'ADD_VIEW', viewId: 'plugin:my-view' })

      const next = panelReducer(withView, { type: 'ADD_VIEW', viewId: 'plugin:my-view' })

      expect(next).toBe(withView)
    })
  })

  describe('REMOVE_VIEW', () => {
    it('removes the view from sections and tab order', () => {
      const state = createInitialState(['explorer'])
      const withView = panelReducer(state, { type: 'ADD_VIEW', viewId: 'plugin:my-view' })

      const next = panelReducer(withView, { type: 'REMOVE_VIEW', viewId: 'plugin:my-view' })

      expect(next.sections[0]!.viewIds).not.toContain('plugin:my-view')
      expect(next.tabOrder).not.toContain('plugin:my-view')
    })

    it('falls back to the remaining tabOrder when the emptied section was the only one', () => {
      const state: PanelState = {
        sections: [{
          id: 'panel-section-test',
          viewIds: ['plugin:my-view'],
          activeViewId: 'plugin:my-view',
          heightFraction: 1,
        }],
        tabOrder: ['favorites', 'plugin:my-view'],
      }

      const next = panelReducer(state, { type: 'REMOVE_VIEW', viewId: 'plugin:my-view' })

      expect(next.sections[0]!.viewIds).toEqual(['favorites'])
      expect(next.sections[0]!.activeViewId).toBe('favorites')
      expect(next.tabOrder).toEqual(['favorites'])
    })

    it('leaves an empty section when nothing remains in tabOrder either', () => {
      const state: PanelState = {
        sections: [{
          id: 'panel-section-test',
          viewIds: ['plugin:my-view'],
          activeViewId: 'plugin:my-view',
          heightFraction: 1,
        }],
        tabOrder: ['plugin:my-view'],
      }

      const next = panelReducer(state, { type: 'REMOVE_VIEW', viewId: 'plugin:my-view' })

      expect(next.sections[0]!.viewIds).toEqual([])
      expect(next.tabOrder).toEqual([])
    })
  })

  describe('SET_TAB_ORDER', () => {
    // Regression test: this action used to only update the flat `tabOrder`
    // field, which nothing renders from — the tab bar reads a section's own
    // `viewIds`, so a drag-reorder dispatched SET_TAB_ORDER but the visible
    // tab order never changed. Existed since the very first Context Panel
    // commit, reported by the user as "tabs can't be reordered anymore."
    it('reorders the given section\'s viewIds (what the tab bar actually renders)', () => {
      const state = createInitialState(['explorer', 'favorites', 'recent'])

      const next = panelReducer(state, {
        type: 'SET_TAB_ORDER',
        sectionId: state.sections[0]!.id,
        viewIds: ['favorites', 'explorer', 'recent'],
      })

      expect(next.sections[0]!.viewIds).toEqual(['favorites', 'explorer', 'recent'])
    })

    it('keeps the flat tabOrder field consistent with all sections\' viewIds', () => {
      const state: PanelState = {
        sections: [
          { id: 'sec-a', viewIds: ['explorer', 'favorites'], activeViewId: 'explorer', heightFraction: 0.5 },
          { id: 'sec-b', viewIds: ['recent'], activeViewId: 'recent', heightFraction: 0.5 },
        ],
        tabOrder: ['explorer', 'favorites', 'recent'],
      }

      const next = panelReducer(state, {
        type: 'SET_TAB_ORDER',
        sectionId: 'sec-a',
        viewIds: ['favorites', 'explorer'],
      })

      expect(next.tabOrder).toEqual(['favorites', 'explorer', 'recent'])
    })

    it('does not affect other sections', () => {
      const state: PanelState = {
        sections: [
          { id: 'sec-a', viewIds: ['explorer', 'favorites'], activeViewId: 'explorer', heightFraction: 0.5 },
          { id: 'sec-b', viewIds: ['recent'], activeViewId: 'recent', heightFraction: 0.5 },
        ],
        tabOrder: ['explorer', 'favorites', 'recent'],
      }

      const next = panelReducer(state, {
        type: 'SET_TAB_ORDER',
        sectionId: 'sec-a',
        viewIds: ['favorites', 'explorer'],
      })

      expect(next.sections[1]).toEqual(state.sections[1])
    })
  })

  describe('SPLIT_VIEW / MOVE_VIEW_TO_SECTION', () => {
    it('splits a view into a new section and moves it back via MOVE_VIEW_TO_SECTION', () => {
      const state = createInitialState(['explorer', 'favorites', 'recent'])

      const split = panelReducer(state, { type: 'SPLIT_VIEW', viewId: 'favorites', targetSectionIndex: 1 })
      expect(split.sections).toHaveLength(2)
      expect(split.sections[1]!.viewIds).toEqual(['favorites'])

      const merged = panelReducer(split, {
        type: 'MOVE_VIEW_TO_SECTION',
        viewId: 'favorites',
        targetSectionId: split.sections[0]!.id,
      })
      expect(merged.sections).toHaveLength(1)
      expect(merged.sections[0]!.viewIds).toContain('favorites')
    })
  })
})
