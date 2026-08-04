import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { warnNoOp, resetNoOpWarnings } from './no-op-warning'

describe('warnNoOp', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetNoOpWarnings()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('names the caller and the unimplemented method', () => {
    warnNoOp('FileManager', 'promptForFileRename')

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('FileManager')
    expect(warn.mock.calls[0]![0]).toContain('promptForFileRename')
  })

  it('appends the consequence when given', () => {
    warnNoOp('ItemView', 'addAction', 'The "Sync" action will not appear.')

    expect(warn.mock.calls[0]![0]).toContain('The "Sync" action will not appear.')
  })

  it('warns only once per scope and method', () => {
    warnNoOp('ItemView', 'addAction')
    warnNoOp('ItemView', 'addAction')
    warnNoOp('ItemView', 'addAction')

    expect(warn).toHaveBeenCalledOnce()
  })

  it('treats the same method on different scopes as distinct', () => {
    warnNoOp('ItemView', 'addAction')
    warnNoOp('FileView', 'addAction')

    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('does not dedup across a reset', () => {
    warnNoOp('ItemView', 'addAction')
    resetNoOpWarnings()
    warnNoOp('ItemView', 'addAction')

    expect(warn).toHaveBeenCalledTimes(2)
  })
})
