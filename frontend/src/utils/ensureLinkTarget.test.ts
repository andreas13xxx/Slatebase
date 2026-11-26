import { describe, it, expect, vi } from 'vitest'
import { ensureLinkTarget } from './ensureLinkTarget'

function createMockApi(fetchImpl: () => Promise<unknown>) {
  return {
    fetchFileContent: vi.fn(fetchImpl),
    saveFile: vi.fn(async () => ({})),
  }
}

describe('ensureLinkTarget', () => {
  it('does nothing when the tree already knows the file', async () => {
    const api = createMockApi(async () => ({}))
    expect(await ensureLinkTarget(api as never, 'v1', 'a.md', true)).toBe('existing')
    expect(api.fetchFileContent).not.toHaveBeenCalled()
    expect(api.saveFile).not.toHaveBeenCalled()
  })

  it('never overwrites a file the server has, even when the tree misses it', async () => {
    const api = createMockApi(async () => ({ content: 'precious' }))
    expect(await ensureLinkTarget(api as never, 'v1', 'a.md', false)).toBe('existing')
    expect(api.saveFile).not.toHaveBeenCalled()
  })

  it('creates an empty note only on FILE_NOT_FOUND', async () => {
    const api = createMockApi(async () => { throw { code: 'FILE_NOT_FOUND', message: 'File not found' } })
    expect(await ensureLinkTarget(api as never, 'v1', 'a.md', false)).toBe('created')
    expect(api.saveFile).toHaveBeenCalledWith('v1', 'a.md', '')
  })

  it('does not write when the lookup fails for another reason', async () => {
    const api = createMockApi(async () => { throw { code: 'INTERNAL_ERROR', message: 'boom' } })
    await expect(ensureLinkTarget(api as never, 'v1', 'a.md', false)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })
    expect(api.saveFile).not.toHaveBeenCalled()
  })
})
