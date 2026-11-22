import { describe, expect, it, vi } from 'vitest'
import type { IApiClient } from '../../../api/index'
import { VaultAdapterShim } from './vault-adapter-shim'

// Regression: TaskNotes writes a stage file below `.tasknotes/` and checks it with adapter.exists()/stat() right away.
// Dot-prefixed paths are hidden from the directory tree, so the tree answered "missing" for a file that was there.
describe('VaultAdapterShim hidden paths', () => {
  function createAdapter(fetchFileContent: ReturnType<typeof vi.fn>): VaultAdapterShim & Record<string, unknown> {
    const apiClient = { fetchFileContent } as unknown as IApiClient
    const instance = new VaultAdapterShim('v1', apiClient, () => ({ name: '', path: '', type: 'directory', children: [] }))
    return VaultAdapterShim.wrapWithProxy(instance)
  }

  it('finds a hidden file through the backend when the tree does not list it', async () => {
    const fetchFileContent = vi.fn().mockResolvedValue({ path: '.tasknotes/a.json', content: '{}' })
    const adapter = createAdapter(fetchFileContent)
    expect(await adapter.exists('.tasknotes/a.json')).toBe(true)
    const stat = await adapter.stat('.tasknotes/a.json')
    expect(stat?.type).toBe('file')
    expect(fetchFileContent).toHaveBeenCalledWith('v1', '.tasknotes/a.json')
  })

  it('reports a missing hidden file as absent', async () => {
    const adapter = createAdapter(vi.fn().mockRejectedValue(new Error('404')))
    expect(await adapter.exists('.tasknotes/none.json')).toBe(false)
    expect(await adapter.stat('.tasknotes/none.json')).toBeNull()
  })

  it('does not call the backend for visible paths missing from the tree', async () => {
    const fetchFileContent = vi.fn()
    const adapter = createAdapter(fetchFileContent)
    expect(await adapter.exists('notes/none.md')).toBe(false)
    expect(fetchFileContent).not.toHaveBeenCalled()
  })

  // Regression: TaskNotes stages `_mdbase/types/x.md.tasknotes-stage-*` (visible path), then reads it back. The tree
  // snapshot is stale right after adapter.write, so exists() said "missing" and the metadata upgrade rolled back.
  it('sees its own write, rename and remove before the tree catches up', async () => {
    const saveFile = vi.fn().mockResolvedValue({})
    const moveContent = vi.fn().mockResolvedValue(undefined)
    const deleteContent = vi.fn().mockResolvedValue(undefined)
    const apiClient = { saveFile, moveContent, deleteContent } as unknown as IApiClient
    const adapter = VaultAdapterShim.wrapWithProxy(
      new VaultAdapterShim('v1', apiClient, () => ({ name: '', path: '', type: 'directory', children: [] })),
    )

    expect(await adapter.exists('_mdbase/types/a.md.stage')).toBe(false)
    await adapter.write('_mdbase/types/a.md.stage', 'x')
    expect(await adapter.exists('_mdbase/types/a.md.stage')).toBe(true)
    expect(await adapter.exists('_mdbase/types')).toBe(true)
    expect((await adapter.stat('_mdbase/types/a.md.stage'))?.type).toBe('file')

    await adapter.rename('_mdbase/types/a.md.stage', '_mdbase/types/a.md')
    expect(await adapter.exists('_mdbase/types/a.md.stage')).toBe(false)
    expect(await adapter.exists('_mdbase/types/a.md')).toBe(true)

    await adapter.remove('_mdbase/types/a.md')
    expect(await adapter.exists('_mdbase/types/a.md')).toBe(false)
  })

  it('answers getBasePath without a gap warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((createAdapter(vi.fn())['getBasePath'] as () => string)()).toBe('/')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
