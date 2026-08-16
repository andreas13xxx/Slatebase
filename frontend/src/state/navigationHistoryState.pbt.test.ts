import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  navigationHistoryReducer,
  initialNavigationHistoryState,
  MAX_STACK_SIZE,
  type NavHistoryEntry,
  type NavigationHistoryAction,
} from './navigationHistoryState'

const arbEntry: fc.Arbitrary<NavHistoryEntry> = fc.record({
  vaultId: fc.constant('v1'),
  filePath: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `${s}.md`),
  fileName: fc.string({ minLength: 1, maxLength: 12 }).map((s) => `${s}.md`),
})

const arbVisitAction: fc.Arbitrary<NavigationHistoryAction> = arbEntry.map((entry) => ({
  type: 'RECORD_VISIT' as const,
  entry,
  origin: 'visit' as const,
}))

describe('navigationHistoryReducer — property tests', () => {
  // Feature: navigation-link-polish, Property 1: Zurück/Vor sind inverse Operationen
  it('GO_BACK followed by GO_FORWARD restores the prior state', () => {
    fc.assert(
      fc.property(fc.array(arbVisitAction, { minLength: 2, maxLength: 20 }), (actions) => {
        let state = initialNavigationHistoryState
        for (const action of actions) {
          state = navigationHistoryReducer(state, action)
        }
        fc.pre(state.back.length > 0)

        const before = state
        const afterBack = navigationHistoryReducer(before, { type: 'GO_BACK' })
        const afterForward = navigationHistoryReducer(afterBack, { type: 'GO_FORWARD' })

        expect(afterForward).toEqual(before)
      }),
      { numRuns: 200 },
    )
  })

  // Feature: navigation-link-polish, Property 2: Neue Navigation verwirft den Vor-Stack
  it('any non-history-nav visit empties the forward stack', () => {
    fc.assert(
      fc.property(
        fc.array(arbVisitAction, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 5 }),
        arbEntry,
        (setupActions, backSteps, newEntry) => {
          let state = initialNavigationHistoryState
          for (const action of setupActions) {
            state = navigationHistoryReducer(state, action)
          }
          for (let i = 0; i < backSteps; i++) {
            state = navigationHistoryReducer(state, { type: 'GO_BACK' })
          }
          fc.pre(state.forward.length > 0)

          const next = navigationHistoryReducer(state, { type: 'RECORD_VISIT', entry: newEntry, origin: 'visit' })
          expect(next.forward).toEqual([])
        },
      ),
      { numRuns: 200 },
    )
  })

  // Feature: navigation-link-polish, Property 3: History-Navigation schreibt sich nicht selbst fort
  it('a history-nav RECORD_VISIT only updates current, never back/forward', () => {
    fc.assert(
      fc.property(fc.array(arbVisitAction, { minLength: 1, maxLength: 10 }), arbEntry, (setupActions, historyEntry) => {
        let state = initialNavigationHistoryState
        for (const action of setupActions) {
          state = navigationHistoryReducer(state, action)
        }
        const next = navigationHistoryReducer(state, { type: 'RECORD_VISIT', entry: historyEntry, origin: 'history-nav' })
        expect(next.back).toBe(state.back)
        expect(next.forward).toBe(state.forward)
        expect(next.current).toEqual(historyEntry)
      }),
      { numRuns: 200 },
    )
  })

  // Feature: navigation-link-polish, Property 4: Stack-Obergrenze
  it('back never exceeds MAX_STACK_SIZE entries', () => {
    fc.assert(
      fc.property(fc.array(arbVisitAction, { minLength: 0, maxLength: 150 }), (actions) => {
        let state = initialNavigationHistoryState
        for (const action of actions) {
          state = navigationHistoryReducer(state, action)
          expect(state.back.length).toBeLessThanOrEqual(MAX_STACK_SIZE)
        }
      }),
      { numRuns: 100 },
    )
  })
})
