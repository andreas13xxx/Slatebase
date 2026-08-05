/**
 * The App and Workspace proxies must feed the api-gap-registry, so that APIs a
 * plugin reached for but Slatebase does not emulate stay enumerable after the
 * console warning has scrolled away.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WorkspaceShim } from './workspace-shim'
import { clearApiGaps, getApiGaps, getApiGapsForPlugin } from '../api-gap-registry'

describe('proxy gap recording', () => {
  beforeEach(() => {
    clearApiGaps()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('records a non-emulated read', () => {
    const workspace = WorkspaceShim.createProxied()

    void (workspace as unknown as Record<string, unknown>)['openPopout']

    expect(getApiGaps()).toEqual([
      { shim: 'Workspace', property: 'openPopout', pluginId: 'unknown', reads: 1, calls: 0 },
    ])
  })

  it('counts repeated reads without duplicating the entry', () => {
    const workspace = WorkspaceShim.createProxied() as unknown as Record<string, unknown>

    void workspace['openPopout']
    void workspace['openPopout']

    expect(getApiGaps()).toHaveLength(1)
    expect(getApiGaps()[0]).toMatchObject({ reads: 2, calls: 0 })
  })

  it('distinguishes a read from an actual call', () => {
    const workspace = WorkspaceShim.createProxied() as unknown as Record<string, unknown>

    const fn = workspace['openPopout'] as () => unknown
    fn()
    fn()

    // The read alone could be feature detection; the calls prove the plugin
    // depended on the API and silently got nothing.
    expect(getApiGaps()[0]).toMatchObject({ reads: 1, calls: 2 })
  })

  it('does not record emulated members', () => {
    const workspace = WorkspaceShim.createProxied()

    workspace.getActiveFile()
    workspace.getActiveLeaf()

    expect(getApiGaps()).toEqual([])
  })

  it('leaves the no-op behaviour unchanged', () => {
    const workspace = WorkspaceShim.createProxied() as unknown as Record<string, unknown>

    const result = workspace['openPopout'] as () => unknown

    expect(result).toBeTypeOf('function')
    expect(result()).toBeUndefined()
  })

  it('documents that the no-op is truthy, so feature detection still misfires', () => {
    const workspace = WorkspaceShim.createProxied() as unknown as Record<string, unknown>

    // Known limitation, deliberately unchanged: a callable no-op cannot also be
    // falsy. Recording the access is what makes this gap discoverable.
    expect(Boolean(workspace['somethingSlatebaseLacks'])).toBe(true)
  })

  it('attributes workspace gaps to "unknown" because the shim is shared', () => {
    const workspace = WorkspaceShim.createProxied() as unknown as Record<string, unknown>

    void workspace['openPopout']

    expect(getApiGapsForPlugin('unknown')).toHaveLength(1)
  })
})
