import { describe, it, expect } from 'vitest'
import {
  navigationHistoryReducer,
  initialNavigationHistoryState,
  MAX_STACK_SIZE,
  type NavHistoryEntry,
  type NavigationHistoryState,
} from './navigationHistoryState'

function entry(filePath: string, vaultId = 'v1'): NavHistoryEntry {
  return { vaultId, filePath, fileName: filePath.split('/').pop() ?? filePath }
}

describe('navigationHistoryReducer', () => {
  describe('RECORD_VISIT', () => {
    it('sets the first visit as current with empty stacks', () => {
      const state = navigationHistoryReducer(initialNavigationHistoryState, {
        type: 'RECORD_VISIT', entry: entry('a.md'), origin: 'visit',
      })
      expect(state.current).toEqual(entry('a.md'))
      expect(state.back).toEqual([])
      expect(state.forward).toEqual([])
    })

    it('pushes the previous current onto back', () => {
      let state = navigationHistoryReducer(initialNavigationHistoryState, {
        type: 'RECORD_VISIT', entry: entry('a.md'), origin: 'visit',
      })
      state = navigationHistoryReducer(state, {
        type: 'RECORD_VISIT', entry: entry('b.md'), origin: 'visit',
      })
      expect(state.back).toEqual([entry('a.md')])
      expect(state.current).toEqual(entry('b.md'))
    })

    it('discards the forward stack on a regular (non history-nav) visit', () => {
      let state: NavigationHistoryState = {
        back: [entry('a.md')],
        forward: [entry('c.md')],
        current: entry('b.md'),
      }
      state = navigationHistoryReducer(state, {
        type: 'RECORD_VISIT', entry: entry('d.md'), origin: 'visit',
      })
      expect(state.forward).toEqual([])
      expect(state.back).toEqual([entry('a.md'), entry('b.md')])
      expect(state.current).toEqual(entry('d.md'))
    })

    it('does not touch back/forward when origin is history-nav', () => {
      const state: NavigationHistoryState = {
        back: [entry('a.md')],
        forward: [entry('c.md')],
        current: entry('b.md'),
      }
      const next = navigationHistoryReducer(state, {
        type: 'RECORD_VISIT', entry: entry('c.md'), origin: 'history-nav',
      })
      expect(next.back).toBe(state.back)
      expect(next.forward).toBe(state.forward)
      expect(next.current).toEqual(entry('c.md'))
    })

    it('is a no-op when re-visiting the already-current file', () => {
      const state: NavigationHistoryState = {
        back: [entry('a.md')],
        forward: [],
        current: entry('b.md'),
      }
      const next = navigationHistoryReducer(state, {
        type: 'RECORD_VISIT', entry: entry('b.md'), origin: 'visit',
      })
      expect(next).toBe(state)
    })

    it('clamps the back stack to MAX_STACK_SIZE, dropping the oldest', () => {
      let state = initialNavigationHistoryState
      for (let i = 0; i < MAX_STACK_SIZE + 5; i++) {
        state = navigationHistoryReducer(state, {
          type: 'RECORD_VISIT', entry: entry(`file-${i}.md`), origin: 'visit',
        })
      }
      expect(state.back).toHaveLength(MAX_STACK_SIZE)
      expect(state.back[0]).toEqual(entry('file-4.md')) // oldest 4 dropped (55 visits - 1 current = 54 pushed, kept last 50)
      expect(state.current).toEqual(entry(`file-${MAX_STACK_SIZE + 4}.md`))
    })
  })

  describe('GO_BACK / GO_FORWARD', () => {
    it('GO_BACK is a no-op on an empty back stack', () => {
      const state = navigationHistoryReducer(initialNavigationHistoryState, { type: 'GO_BACK' })
      expect(state).toBe(initialNavigationHistoryState)
    })

    it('GO_FORWARD is a no-op on an empty forward stack', () => {
      const state = navigationHistoryReducer(initialNavigationHistoryState, { type: 'GO_FORWARD' })
      expect(state).toBe(initialNavigationHistoryState)
    })

    it('GO_BACK moves current to back and pops the top of back', () => {
      const state: NavigationHistoryState = {
        back: [entry('a.md'), entry('b.md')],
        forward: [],
        current: entry('c.md'),
      }
      const next = navigationHistoryReducer(state, { type: 'GO_BACK' })
      expect(next.current).toEqual(entry('b.md'))
      expect(next.back).toEqual([entry('a.md')])
      expect(next.forward).toEqual([entry('c.md')])
    })

    it('GO_BACK then GO_FORWARD restores the original current (Property 1)', () => {
      const state: NavigationHistoryState = {
        back: [entry('a.md'), entry('b.md')],
        forward: [],
        current: entry('c.md'),
      }
      const afterBack = navigationHistoryReducer(state, { type: 'GO_BACK' })
      const afterForward = navigationHistoryReducer(afterBack, { type: 'GO_FORWARD' })
      expect(afterForward.current).toEqual(state.current)
      expect(afterForward.back).toEqual(state.back)
      expect(afterForward.forward).toEqual(state.forward)
    })
  })

  describe('DROP_ENTRY', () => {
    it('removes matching entries from both stacks and clears current if it matches', () => {
      const state: NavigationHistoryState = {
        back: [entry('a.md'), entry('gone.md')],
        forward: [entry('gone.md')],
        current: entry('gone.md'),
      }
      const next = navigationHistoryReducer(state, { type: 'DROP_ENTRY', vaultId: 'v1', filePath: 'gone.md' })
      expect(next.back).toEqual([entry('a.md')])
      expect(next.forward).toEqual([])
      expect(next.current).toBeNull()
    })

    it('leaves current untouched when it does not match', () => {
      const state: NavigationHistoryState = {
        back: [entry('gone.md')],
        forward: [],
        current: entry('here.md'),
      }
      const next = navigationHistoryReducer(state, { type: 'DROP_ENTRY', vaultId: 'v1', filePath: 'gone.md' })
      expect(next.current).toEqual(entry('here.md'))
      expect(next.back).toEqual([])
    })
  })

  describe('CLEAR', () => {
    it('resets to the initial state', () => {
      const state: NavigationHistoryState = {
        back: [entry('a.md')],
        forward: [entry('b.md')],
        current: entry('c.md'),
      }
      expect(navigationHistoryReducer(state, { type: 'CLEAR' })).toEqual(initialNavigationHistoryState)
    })
  })
})
