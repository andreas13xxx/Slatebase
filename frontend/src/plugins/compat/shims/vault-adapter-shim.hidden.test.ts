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

  it('reports the size of its own write, not 0', async () => {
    const apiClient = { saveFile: vi.fn().mockResolvedValue({}) } as unknown as IApiClient
    const adapter = VaultAdapterShim.wrapWithProxy(
      new VaultAdapterShim('v1', apiClient, () => ({ name: '', path: '', type: 'directory', children: [] })),
    )
    await adapter.write('notes/a.md', 'äb')
    expect((await adapter.stat('notes/a.md'))?.size).toBe(3)
  })

  it('treats everything below a removed folder as gone', async () => {
    const tree = {
      name: '', path: '', type: 'directory',
      children: [{ name: 'dir', path: 'dir', type: 'directory', children: [{ name: 'c.md', path: 'dir/c.md', type: 'file' }] }],
    }
    const apiClient = { deleteContent: vi.fn().mockResolvedValue(undefined) } as unknown as IApiClient
    const adapter = VaultAdapterShim.wrapWithProxy(new VaultAdapterShim('v1', apiClient, () => tree as never))
    expect(await adapter.exists('dir/c.md')).toBe(true)
    await adapter.remove('dir')
    expect(await adapter.exists('dir/c.md')).toBe(false)
    expect(await adapter.stat('dir/c.md')).toBeNull()
  })

  it('finds the children of a renamed folder before the tree catches up, and after', async () => {
    let tree = {
      name: '', path: '', type: 'directory',
      children: [{ name: 'old', path: 'old', type: 'directory', children: [{ name: 'c.md', path: 'old/c.md', type: 'file', size: 7 }] }],
    }
    const apiClient = { moveContent: vi.fn().mockResolvedValue(undefined) } as unknown as IApiClient
    const adapter = VaultAdapterShim.wrapWithProxy(new VaultAdapterShim('v1', apiClient, () => tree as never))
    await adapter.rename('old', 'new')
    expect(await adapter.exists('new/c.md')).toBe(true)
    expect((await adapter.stat('new/c.md'))?.size).toBe(7)
    expect(await adapter.exists('old/c.md')).toBe(false)
    // The realtime refresh lands: the tree now lists the new path and not the old one.
    tree = {
      name: '', path: '', type: 'directory',
      children: [{ name: 'new', path: 'new', type: 'directory', children: [{ name: 'c.md', path: 'new/c.md', type: 'file', size: 7 }] }],
    }
    expect(await adapter.exists('new/c.md')).toBe(true)
  })

  it('does not download a hidden file again for every poll', async () => {
    const fetchFileContent = vi.fn().mockResolvedValue({ path: '.x/data.json', content: '{}' })
    const adapter = createAdapter(fetchFileContent)
    await Promise.all([adapter.exists('.x/data.json'), adapter.exists('.x/data.json'), adapter.stat('.x/data.json')])
    await adapter.exists('.x/data.json')
    expect(fetchFileContent).toHaveBeenCalledTimes(1)
  })

  it('answers getBasePath without a gap warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((createAdapter(vi.fn())['getBasePath'] as () => string)()).toBe('/')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
