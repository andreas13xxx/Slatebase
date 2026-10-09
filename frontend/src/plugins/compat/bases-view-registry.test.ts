/**
 * Tests for the Bases view registry (Plugin.registerBasesView backing store).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerBasesView,
  getBasesViewRegistration,
  hasBasesViewRegistration,
  listBasesViewRegistrations,
  clearForPlugin,
  resetForVault,
  type BasesViewRegistration,
} from './bases-view-registry'

const makeRegistration = (name: string): BasesViewRegistration => ({
  name,
  factory: (_controller, el) => ({ containerEl: el, onDataUpdated() {} }),
})

describe('bases-view-registry', () => {
  beforeEach(() => resetForVault())

  it('registers a view type and resolves it by id', () => {
    const reg = makeRegistration('Cards')
    expect(registerBasesView('cards', reg, 'card-plugin')).toBe(true)
    expect(hasBasesViewRegistration('cards')).toBe(true)
    expect(getBasesViewRegistration('cards')).toBe(reg)
  })

  it('returns null for an unregistered view type', () => {
    expect(getBasesViewRegistration('nope')).toBeNull()
    expect(hasBasesViewRegistration('nope')).toBe(false)
  })

  it('rejects an invalid id or non-function factory', () => {
    expect(registerBasesView('', makeRegistration('x'), 'p')).toBe(false)
    expect(registerBasesView('bad', { name: 'x', factory: undefined as unknown as BasesViewRegistration['factory'] }, 'p')).toBe(false)
    expect(hasBasesViewRegistration('bad')).toBe(false)
  })

  it('does not overwrite an existing registration (returns false)', () => {
    const first = makeRegistration('First')
    const second = makeRegistration('Second')
    expect(registerBasesView('cards', first, 'plugin-a')).toBe(true)
    expect(registerBasesView('cards', second, 'plugin-b')).toBe(false)
    expect(getBasesViewRegistration('cards')).toBe(first)
  })

  it('lists registered view types with names and icons', () => {
    registerBasesView('cards', { ...makeRegistration('Cards'), icon: 'layout-grid' }, 'p1')
    registerBasesView('cal', makeRegistration('Calendar'), 'p2')
    const list = listBasesViewRegistrations()
    expect(list).toHaveLength(2)
    expect(list.find((e) => e.viewId === 'cards')).toEqual({ viewId: 'cards', name: 'Cards', icon: 'layout-grid' })
    expect(list.find((e) => e.viewId === 'cal')).toEqual({ viewId: 'cal', name: 'Calendar' })
  })

  it('clearForPlugin removes only that plugin\'s registrations', () => {
    registerBasesView('cards', makeRegistration('Cards'), 'plugin-a')
    registerBasesView('cal', makeRegistration('Calendar'), 'plugin-b')
    clearForPlugin('plugin-a')
    expect(hasBasesViewRegistration('cards')).toBe(false)
    expect(hasBasesViewRegistration('cal')).toBe(true)
  })

  it('resetForVault clears everything', () => {
    registerBasesView('cards', makeRegistration('Cards'), 'plugin-a')
    registerBasesView('cal', makeRegistration('Calendar'), 'plugin-b')
    resetForVault()
    expect(listBasesViewRegistrations()).toHaveLength(0)
  })
})
