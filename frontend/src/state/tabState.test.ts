import { describe, it, expect } from 'vitest'
import {
  tabReducer,
  generateTabId,
  initialTabState,
  type TabState,
  type TabEntry,
} from './tabState'

describe('generateTabId', () => {
  it('returns vaultId::filePath format', () => {
    expect(generateTabId('vault1', 'docs/readme.md')).toBe('vault1::docs/readme.md')
  })

  it('handles empty strings', () => {
    expect(generateTabId('', '')).toBe('::')
  })
})

describe('tabReducer', () => {
  describe('OPEN_TAB', () => {
    it('creates a new tab and sets it as active', () => {
      const state = tabReducer(initialTabState, {
        type: 'OPEN_TAB',
        payload: { vaultId: 'v1', filePath: 'notes/hello.md', fileName: 'hello.md' },
      })

      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].id).toBe('v1::notes/hello.md')
      expect(state.tabs[0].vaultId).toBe('v1')
      expect(state.tabs[0].filePath).toBe('notes/hello.md')
      expect(state.tabs[0].fileName).toBe('hello.md')
      expect(state.tabs[0].loading).toBe(true)
      expect(state.tabs[0].mode).toBe('view')
      expect(state.tabs[0].isBinary).toBe(false)
      expect(state.tabs[0].content).toBe('')
      expect(state.tabs[0].editBuffer).toBeNull()
      expect(state.tabs[0].error).toBeNull()
      expect(state.activeTabId).toBe('v1::notes/hello.md')
    })

    it('activates existing tab without creating duplicate', () => {
      const stateWithTab: TabState = {
        tabs: [
          createTab('v1', 'a.md', 'a.md'),
          createTab('v1', 'b.md', 'b.md'),
        ],
        activeTabId: 'v1::b.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'OPEN_TAB',
        payload: { vaultId: 'v1', filePath: 'a.md', fileName: 'a.md' },
      })

      expect(state.tabs).toHaveLength(2)
      expect(state.activeTabId).toBe('v1::a.md')
    })

    it('preserves insertion order for new tabs', () => {
      let state = initialTabState
      state = tabReducer(state, {
        type: 'OPEN_TAB',
        payload: { vaultId: 'v1', filePath: 'first.md', fileName: 'first.md' },
      })
      state = tabReducer(state, {
        type: 'OPEN_TAB',
        payload: { vaultId: 'v1', filePath: 'second.md', fileName: 'second.md' },
      })
      state = tabReducer(state, {
        type: 'OPEN_TAB',
        payload: { vaultId: 'v1', filePath: 'third.md', fileName: 'third.md' },
      })

      expect(state.tabs.map((t) => t.fileName)).toEqual(['first.md', 'second.md', 'third.md'])
    })
  })

  describe('CLOSE_TAB', () => {
    it('removes the tab from the list', () => {
      const stateWithTabs: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md'), createTab('v1', 'b.md', 'b.md')],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'CLOSE_TAB',
        payload: { tabId: 'v1::b.md' },
      })

      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].id).toBe('v1::a.md')
    })

    it('activates right neighbor when active tab is closed', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'a.md', 'a.md'),
          createTab('v1', 'b.md', 'b.md'),
          createTab('v1', 'c.md', 'c.md'),
        ],
        activeTabId: 'v1::b.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'CLOSE_TAB',
        payload: { tabId: 'v1::b.md' },
      })

      expect(state.activeTabId).toBe('v1::c.md')
    })

    it('activates left neighbor when rightmost active tab is closed', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'a.md', 'a.md'),
          createTab('v1', 'b.md', 'b.md'),
          createTab('v1', 'c.md', 'c.md'),
        ],
        activeTabId: 'v1::c.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'CLOSE_TAB',
        payload: { tabId: 'v1::c.md' },
      })

      expect(state.activeTabId).toBe('v1::b.md')
    })

    it('sets activeTabId to null when last tab is closed', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md')],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'CLOSE_TAB',
        payload: { tabId: 'v1::a.md' },
      })

      expect(state.tabs).toHaveLength(0)
      expect(state.activeTabId).toBeNull()
    })

    it('keeps active tab unchanged when closing a non-active tab', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'a.md', 'a.md'),
          createTab('v1', 'b.md', 'b.md'),
          createTab('v1', 'c.md', 'c.md'),
        ],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'CLOSE_TAB',
        payload: { tabId: 'v1::b.md' },
      })

      expect(state.activeTabId).toBe('v1::a.md')
      expect(state.tabs).toHaveLength(2)
    })

    it('does nothing for non-existent tab ID', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md')],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'CLOSE_TAB',
        payload: { tabId: 'nonexistent' },
      })

      expect(state).toEqual(stateWithTab)
    })
  })

  describe('ACTIVATE_TAB', () => {
    it('sets the specified tab as active', () => {
      const stateWithTabs: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md'), createTab('v1', 'b.md', 'b.md')],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'ACTIVATE_TAB',
        payload: { tabId: 'v1::b.md' },
      })

      expect(state.activeTabId).toBe('v1::b.md')
    })

    it('does nothing for non-existent tab ID', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md')],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'ACTIVATE_TAB',
        payload: { tabId: 'nonexistent' },
      })

      expect(state.activeTabId).toBe('v1::a.md')
    })
  })

  describe('TOGGLE_MODE', () => {
    it('toggles mode from edit to view', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md', { mode: 'edit' })],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'TOGGLE_MODE',
        payload: { tabId: 'v1::a.md' },
      })

      expect(state.tabs[0].mode).toBe('view')
    })

    it('toggles mode from view to edit', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md', { mode: 'view' })],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'TOGGLE_MODE',
        payload: { tabId: 'v1::a.md' },
      })

      expect(state.tabs[0].mode).toBe('edit')
    })

    it('does not toggle mode for binary files', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'image.png', 'image.png', { mode: 'view', isBinary: true })],
        activeTabId: 'v1::image.png',
      }

      const state = tabReducer(stateWithTab, {
        type: 'TOGGLE_MODE',
        payload: { tabId: 'v1::image.png' },
      })

      expect(state.tabs[0].mode).toBe('view')
    })

    it('only affects the targeted tab', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'a.md', 'a.md', { mode: 'edit' }),
          createTab('v1', 'b.md', 'b.md', { mode: 'view' }),
        ],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'TOGGLE_MODE',
        payload: { tabId: 'v1::a.md' },
      })

      expect(state.tabs[0].mode).toBe('view')
      expect(state.tabs[1].mode).toBe('view') // unchanged
    })

    it('preserves editBuffer across mode toggle', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md', { mode: 'edit', editBuffer: 'unsaved changes' })],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'TOGGLE_MODE',
        payload: { tabId: 'v1::a.md' },
      })

      expect(state.tabs[0].editBuffer).toBe('unsaved changes')
    })
  })

  describe('TAB_CONTENT_LOADED', () => {
    it('sets content and clears loading for text files', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md', { loading: true })],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'TAB_CONTENT_LOADED',
        payload: { tabId: 'v1::a.md', content: '# Hello', isBinary: false },
      })

      expect(state.tabs[0].content).toBe('# Hello')
      expect(state.tabs[0].isBinary).toBe(false)
      expect(state.tabs[0].mode).toBe('view')
      expect(state.tabs[0].loading).toBe(false)
      expect(state.tabs[0].error).toBeNull()
    })

    it('sets mode to view for binary files', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'image.png', 'image.png', { loading: true })],
        activeTabId: 'v1::image.png',
      }

      const state = tabReducer(stateWithTab, {
        type: 'TAB_CONTENT_LOADED',
        payload: { tabId: 'v1::image.png', content: '', isBinary: true },
      })

      expect(state.tabs[0].isBinary).toBe(true)
      expect(state.tabs[0].mode).toBe('view')
      expect(state.tabs[0].loading).toBe(false)
    })
  })

  describe('TAB_LOADING', () => {
    it('sets loading true and clears error', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md', { loading: false, error: 'old error' })],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'TAB_LOADING',
        payload: { tabId: 'v1::a.md' },
      })

      expect(state.tabs[0].loading).toBe(true)
      expect(state.tabs[0].error).toBeNull()
    })
  })

  describe('TAB_ERROR', () => {
    it('sets error and clears loading', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md', { loading: true })],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'TAB_ERROR',
        payload: { tabId: 'v1::a.md', error: 'Network error' },
      })

      expect(state.tabs[0].loading).toBe(false)
      expect(state.tabs[0].error).toBe('Network error')
    })
  })

  describe('UPDATE_EDIT_BUFFER', () => {
    it('sets the edit buffer content', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md', { content: 'original' })],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'UPDATE_EDIT_BUFFER',
        payload: { tabId: 'v1::a.md', content: 'modified content' },
      })

      expect(state.tabs[0].editBuffer).toBe('modified content')
      expect(state.tabs[0].content).toBe('original') // unchanged
    })
  })

  describe('SAVE_SUCCESS', () => {
    it('updates content, clears editBuffer and error', () => {
      const stateWithTab: TabState = {
        tabs: [
          createTab('v1', 'a.md', 'a.md', {
            content: 'old',
            editBuffer: 'new content',
            error: 'previous error',
          }),
        ],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'SAVE_SUCCESS',
        payload: { tabId: 'v1::a.md', content: 'new content' },
      })

      expect(state.tabs[0].content).toBe('new content')
      expect(state.tabs[0].editBuffer).toBeNull()
      expect(state.tabs[0].error).toBeNull()
    })
  })

  describe('SAVE_ERROR', () => {
    it('sets error while preserving editBuffer', () => {
      const stateWithTab: TabState = {
        tabs: [
          createTab('v1', 'a.md', 'a.md', { editBuffer: 'unsaved work' }),
        ],
        activeTabId: 'v1::a.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'SAVE_ERROR',
        payload: { tabId: 'v1::a.md', error: 'Save failed' },
      })

      expect(state.tabs[0].error).toBe('Save failed')
      expect(state.tabs[0].editBuffer).toBe('unsaved work') // preserved
    })
  })

  describe('UPDATE_TAB_PATHS', () => {
    it('updates filePath for exact match', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'docs/readme.md', 'readme.md')],
        activeTabId: 'v1::docs/readme.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'UPDATE_TAB_PATHS',
        payload: { oldPathPrefix: 'docs/readme.md', newPathPrefix: 'notes/readme.md' },
      })

      expect(state.tabs[0].filePath).toBe('notes/readme.md')
      expect(state.tabs[0].fileName).toBe('readme.md')
      expect(state.tabs[0].id).toBe('v1::notes/readme.md')
    })

    it('updates filePath for prefix match (folder rename)', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'docs/guide.md', 'guide.md'),
          createTab('v1', 'docs/sub/deep.md', 'deep.md'),
        ],
        activeTabId: 'v1::docs/guide.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'UPDATE_TAB_PATHS',
        payload: { oldPathPrefix: 'docs', newPathPrefix: 'notes' },
      })

      expect(state.tabs[0].filePath).toBe('notes/guide.md')
      expect(state.tabs[0].id).toBe('v1::notes/guide.md')
      expect(state.tabs[1].filePath).toBe('notes/sub/deep.md')
      expect(state.tabs[1].id).toBe('v1::notes/sub/deep.md')
    })

    it('leaves non-matching tabs unchanged', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'docs/guide.md', 'guide.md'),
          createTab('v1', 'other/file.md', 'file.md'),
        ],
        activeTabId: 'v1::other/file.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'UPDATE_TAB_PATHS',
        payload: { oldPathPrefix: 'docs', newPathPrefix: 'notes' },
      })

      expect(state.tabs[0].filePath).toBe('notes/guide.md')
      expect(state.tabs[1].filePath).toBe('other/file.md') // unchanged
      expect(state.tabs[1].id).toBe('v1::other/file.md')
    })

    it('updates activeTabId when active tab path changes', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'docs/active.md', 'active.md')],
        activeTabId: 'v1::docs/active.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'UPDATE_TAB_PATHS',
        payload: { oldPathPrefix: 'docs', newPathPrefix: 'notes' },
      })

      expect(state.activeTabId).toBe('v1::notes/active.md')
    })

    it('does not update activeTabId when active tab is unaffected', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'docs/guide.md', 'guide.md'),
          createTab('v1', 'other/file.md', 'file.md'),
        ],
        activeTabId: 'v1::other/file.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'UPDATE_TAB_PATHS',
        payload: { oldPathPrefix: 'docs', newPathPrefix: 'notes' },
      })

      expect(state.activeTabId).toBe('v1::other/file.md')
    })

    it('updates fileName when file is renamed', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'docs/old-name.md', 'old-name.md')],
        activeTabId: 'v1::docs/old-name.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'UPDATE_TAB_PATHS',
        payload: { oldPathPrefix: 'docs/old-name.md', newPathPrefix: 'docs/new-name.md' },
      })

      expect(state.tabs[0].filePath).toBe('docs/new-name.md')
      expect(state.tabs[0].fileName).toBe('new-name.md')
    })

    it('does not match partial path segments', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'documents/file.md', 'file.md')],
        activeTabId: 'v1::documents/file.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'UPDATE_TAB_PATHS',
        payload: { oldPathPrefix: 'doc', newPathPrefix: 'notes' },
      })

      // 'documents/file.md' does NOT start with 'doc/' and does NOT equal 'doc'
      expect(state.tabs[0].filePath).toBe('documents/file.md')
    })
  })

  describe('CLOSE_TABS_BY_PATH', () => {
    it('removes tab with exact path match', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'docs/file.md', 'file.md'),
          createTab('v1', 'other/file.md', 'file.md'),
        ],
        activeTabId: 'v1::other/file.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'CLOSE_TABS_BY_PATH',
        payload: { pathPrefix: 'docs/file.md' },
      })

      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].filePath).toBe('other/file.md')
    })

    it('removes all tabs within a deleted folder', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'docs/a.md', 'a.md'),
          createTab('v1', 'docs/sub/b.md', 'b.md'),
          createTab('v1', 'other/c.md', 'c.md'),
        ],
        activeTabId: 'v1::docs/a.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'CLOSE_TABS_BY_PATH',
        payload: { pathPrefix: 'docs' },
      })

      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].filePath).toBe('other/c.md')
    })

    it('selects next available tab when active tab is removed', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'docs/a.md', 'a.md'),
          createTab('v1', 'other/b.md', 'b.md'),
        ],
        activeTabId: 'v1::docs/a.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'CLOSE_TABS_BY_PATH',
        payload: { pathPrefix: 'docs' },
      })

      expect(state.activeTabId).toBe('v1::other/b.md')
    })

    it('sets activeTabId to null when all tabs are removed', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'docs/a.md', 'a.md'),
          createTab('v1', 'docs/b.md', 'b.md'),
        ],
        activeTabId: 'v1::docs/a.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'CLOSE_TABS_BY_PATH',
        payload: { pathPrefix: 'docs' },
      })

      expect(state.tabs).toHaveLength(0)
      expect(state.activeTabId).toBeNull()
    })

    it('keeps activeTabId unchanged when active tab is not affected', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'docs/a.md', 'a.md'),
          createTab('v1', 'other/b.md', 'b.md'),
        ],
        activeTabId: 'v1::other/b.md',
      }

      const state = tabReducer(stateWithTabs, {
        type: 'CLOSE_TABS_BY_PATH',
        payload: { pathPrefix: 'docs' },
      })

      expect(state.activeTabId).toBe('v1::other/b.md')
    })

    it('does not match partial path segments', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'documents/file.md', 'file.md')],
        activeTabId: 'v1::documents/file.md',
      }

      const state = tabReducer(stateWithTab, {
        type: 'CLOSE_TABS_BY_PATH',
        payload: { pathPrefix: 'doc' },
      })

      // 'documents/file.md' does NOT equal 'doc' and does NOT start with 'doc/'
      expect(state.tabs).toHaveLength(1)
    })
  })

  describe('TOGGLE_PIN', () => {
    it('pins an unpinned tab', () => {
      const stateWithTabs: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md'), createTab('v1', 'b.md', 'b.md')],
        activeTabId: 'v1::a.md',
        closedTabsHistory: [],
      }

      const state = tabReducer(stateWithTabs, { type: 'TOGGLE_PIN', payload: { tabId: 'v1::a.md' } })

      expect(state.tabs[0].pinned).toBe(true)
      expect(state.tabs[1].pinned).toBe(false)
    })

    it('unpins a pinned tab', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md', { pinned: true })],
        activeTabId: 'v1::a.md',
        closedTabsHistory: [],
      }

      const state = tabReducer(stateWithTab, { type: 'TOGGLE_PIN', payload: { tabId: 'v1::a.md' } })

      expect(state.tabs[0].pinned).toBe(false)
    })

    it('does nothing for a non-existent tab ID', () => {
      const stateWithTab: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md')],
        activeTabId: 'v1::a.md',
        closedTabsHistory: [],
      }

      const state = tabReducer(stateWithTab, { type: 'TOGGLE_PIN', payload: { tabId: 'nonexistent' } })

      expect(state.tabs[0].pinned).toBe(false)
    })
  })

  describe('CLOSE_OTHER_TABS', () => {
    it('closes every other tab and activates the target', () => {
      const stateWithTabs: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md'), createTab('v1', 'b.md', 'b.md'), createTab('v1', 'c.md', 'c.md')],
        activeTabId: 'v1::a.md',
        closedTabsHistory: [],
      }

      const state = tabReducer(stateWithTabs, { type: 'CLOSE_OTHER_TABS', payload: { tabId: 'v1::b.md' } })

      expect(state.tabs.map((t) => t.id)).toEqual(['v1::b.md'])
      expect(state.activeTabId).toBe('v1::b.md')
    })

    it('keeps pinned tabs alive even though they are not the target', () => {
      const stateWithTabs: TabState = {
        tabs: [
          createTab('v1', 'a.md', 'a.md', { pinned: true }),
          createTab('v1', 'b.md', 'b.md'),
          createTab('v1', 'c.md', 'c.md', { pinned: true }),
        ],
        activeTabId: 'v1::b.md',
        closedTabsHistory: [],
      }

      const state = tabReducer(stateWithTabs, { type: 'CLOSE_OTHER_TABS', payload: { tabId: 'v1::b.md' } })

      expect(state.tabs.map((t) => t.id)).toEqual(['v1::a.md', 'v1::b.md', 'v1::c.md'])
      expect(state.activeTabId).toBe('v1::b.md')
    })

    it('does nothing when the target tab does not exist', () => {
      const stateWithTabs: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md')],
        activeTabId: 'v1::a.md',
        closedTabsHistory: [],
      }

      const state = tabReducer(stateWithTabs, { type: 'CLOSE_OTHER_TABS', payload: { tabId: 'nonexistent' } })

      expect(state).toEqual(stateWithTabs)
    })
  })

  describe('CLOSE_TAB — closedTabsHistory', () => {
    it('pushes the closed tab onto closedTabsHistory', () => {
      const stateWithTabs: TabState = {
        tabs: [createTab('v1', 'a.md', 'a.md'), createTab('v1', 'b.md', 'b.md')],
        activeTabId: 'v1::a.md',
        closedTabsHistory: [],
      }

      const state = tabReducer(stateWithTabs, { type: 'CLOSE_TAB', payload: { tabId: 'v1::b.md' } })

      expect(state.closedTabsHistory).toHaveLength(1)
      expect(state.closedTabsHistory[0]!.id).toBe('v1::b.md')
    })

    it('caps the history at MAX_CLOSED_TABS_HISTORY, dropping the oldest entry', () => {
      const existingHistory = Array.from({ length: 20 }, (_, i) => createTab('v1', `old-${i}.md`, `old-${i}.md`))
      const stateWithTabs: TabState = {
        tabs: [createTab('v1', 'new.md', 'new.md')],
        activeTabId: 'v1::new.md',
        closedTabsHistory: existingHistory,
      }

      const state = tabReducer(stateWithTabs, { type: 'CLOSE_TAB', payload: { tabId: 'v1::new.md' } })

      expect(state.closedTabsHistory).toHaveLength(20)
      expect(state.closedTabsHistory[0]!.id).toBe('v1::old-1.md') // old-0.md dropped
      expect(state.closedTabsHistory[19]!.id).toBe('v1::new.md')
    })

    it('falls back to an empty history when closedTabsHistory is missing from state (legacy fixtures)', () => {
      const legacyState = {
        tabs: [createTab('v1', 'a.md', 'a.md')],
        activeTabId: 'v1::a.md',
      } as TabState

      expect(() => tabReducer(legacyState, { type: 'CLOSE_TAB', payload: { tabId: 'v1::a.md' } })).not.toThrow()
    })
  })

  describe('POP_CLOSED_TAB', () => {
    it('removes the most recently closed entry', () => {
      const stateWithHistory: TabState = {
        tabs: [],
        activeTabId: null,
        closedTabsHistory: [createTab('v1', 'a.md', 'a.md'), createTab('v1', 'b.md', 'b.md')],
      }

      const state = tabReducer(stateWithHistory, { type: 'POP_CLOSED_TAB' })

      expect(state.closedTabsHistory).toHaveLength(1)
      expect(state.closedTabsHistory[0]!.id).toBe('v1::a.md')
    })

    it('is a no-op when history is empty', () => {
      const stateWithoutHistory: TabState = { tabs: [], activeTabId: null, closedTabsHistory: [] }

      const state = tabReducer(stateWithoutHistory, { type: 'POP_CLOSED_TAB' })

      expect(state).toEqual(stateWithoutHistory)
    })
  })
})

// --- Helper ---

function createTab(
  vaultId: string,
  filePath: string,
  fileName: string,
  overrides: Partial<TabEntry> = {},
): TabEntry {
  return {
    id: generateTabId(vaultId, filePath),
    vaultId,
    filePath,
    fileName,
    mode: 'view',
    isBinary: false,
    content: '',
    editBuffer: null,
    loading: false,
    error: null,
    pinned: false,
    ...overrides,
  }
}
