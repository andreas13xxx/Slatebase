/**
 * The App and Workspace proxies must feed the api-gap-registry, so that APIs a
 * plugin reached for but Slatebase does not emulate stay enumerable after the
 * console warning has scrolled away.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { WorkspaceShim } from './workspace-shim'
import { VaultAdapterShim } from './vault-adapter-shim'
import { FileManagerShim } from './file-manager-shim'
import type { IApiClient } from '../../../api/index'
import type { IVaultShim } from '../types'
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

  // Regression: real Object.prototype members (hasOwnProperty, toString, valueOf, …)
  // aren't in any shim's emulatedProperties allowlist, so without an explicit
  // passthrough they fell into the generic gap path — `workspace.hasOwnProperty`
  // came back as a callable no-op instead of the real, inherited method, silently
  // breaking any `obj.hasOwnProperty(x)`-style feature detection a plugin (or a
  // library it pulls in) performs against the shim.
  it('passes real Object.prototype members through instead of recording a gap', () => {
    const workspace = WorkspaceShim.createProxied() as unknown as Record<string, unknown>

    const hasOwnProperty = workspace['hasOwnProperty'] as (prop: string) => boolean

    expect(hasOwnProperty('layoutReady')).toBe(true)
    expect(hasOwnProperty('definitelyNotARealProperty')).toBe(false)
    expect(getApiGaps()).toEqual([])
  })

  describe('VaultAdapterShim', () => {
    function createProxiedAdapter(): Record<string, unknown> {
      const instance = new VaultAdapterShim('vault-1', {} as IApiClient, () => ({ name: '', path: '', type: 'directory', children: [] }))
      return VaultAdapterShim.wrapWithProxy(instance) as unknown as Record<string, unknown>
    }

    it('records a non-emulated read instead of returning undefined', () => {
      const adapter = createProxiedAdapter()

      void adapter['getResourcePath']

      expect(getApiGaps()).toEqual([
        { shim: 'VaultAdapter', property: 'getResourcePath', pluginId: 'unknown', reads: 1, calls: 0 },
      ])
    })

    it('returns a safe no-op instead of throwing when the gap is called', () => {
      const adapter = createProxiedAdapter()

      const copy = adapter['copy'] as () => unknown

      expect(copy).toBeTypeOf('function')
      expect(() => copy()).not.toThrow()
      expect(copy()).toBeUndefined()
    })

    it('does not record emulated members', () => {
      const adapter = createProxiedAdapter()

      void adapter['exists']
      void adapter['read']

      expect(getApiGaps()).toEqual([])
    })
  })

  describe('FileManagerShim', () => {
    function createProxiedFileManager(): Record<string, unknown> {
      const instance = new FileManagerShim({} as IVaultShim)
      return FileManagerShim.wrapWithProxy(instance) as unknown as Record<string, unknown>
    }

    // Regression test: real Obsidian's method is `promptForFileDeletion`, not
    // `promptForDeletion` — a real plugin (Calendar) was found calling the
    // real name and silently falling through to the Proxy's no-op because the
    // shim was implemented and allow-listed under the wrong name.
    it('emulates promptForFileDeletion (the real Obsidian method name) without recording a gap', () => {
      const fileManager = createProxiedFileManager()

      void fileManager['promptForFileDeletion']

      expect(getApiGaps()).toEqual([])
    })

    it('records a non-emulated read', () => {
      const fileManager = createProxiedFileManager()

      void fileManager['promptForFolderDeletion']

      expect(getApiGaps()).toEqual([
        { shim: 'FileManager', property: 'promptForFolderDeletion', pluginId: 'unknown', reads: 1, calls: 0 },
      ])
    })
  })
})
