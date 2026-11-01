import { describe, expect, it } from 'vitest'
import { describeWorkspacesDeviations, isValidWorkspaceName } from './workspaces-config.js'

describe('isValidWorkspaceName', () => {
  it('accepts ordinary names, also with spaces and non-ASCII letters', () => {
    for (const name of ['Writing', 'Mein Layout', 'Übersicht 2', 'a/b']) expect(isValidWorkspaceName(name)).toBe(true)
  })

  it('refuses empty, blank, control characters, over-long names and prototype keys', () => {
    for (const name of ['', '   ', 'a\nb', 'a\u0000b', 'x'.repeat(201), '__proto__', 'constructor', 'prototype']) {
      expect(isValidWorkspaceName(name)).toBe(false)
    }
  })
})

describe('describeWorkspacesDeviations', () => {
  it('is quiet for a good file', () => {
    expect(describeWorkspacesDeviations({ workspaces: { A: { main: { type: 'split' } }, B: {} }, active: 'A' })).toEqual([])
    expect(describeWorkspacesDeviations({})).toEqual([])
  })

  it('reports what is not a layout, a name or a tree', () => {
    const keys = describeWorkspacesDeviations({ workspaces: { A: 3, B: { main: 'x' }, '': {} }, active: 4 }).map((d) => d.key)
    expect(keys).toEqual(['workspaces.A', 'workspaces.B.main', 'workspaces.', 'active'])
  })

  it('reports a workspaces field that is not an object', () => {
    expect(describeWorkspacesDeviations({ workspaces: [] }).map((d) => d.key)).toEqual(['workspaces'])
  })
})
