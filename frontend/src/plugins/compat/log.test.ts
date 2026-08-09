import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { warnNoOp, warnOnce, debugOnce, resetLogDedup } from './log'

describe('warnNoOp', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetLogDedup()
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
    resetLogDedup()
    warnNoOp('ItemView', 'addAction')

    expect(warn).toHaveBeenCalledTimes(2)
  })
})

describe('warnOnce', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetLogDedup()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('logs at warn level, once per key', () => {
    warnOnce('workspace-shim::unknownProp::foo', 'unsupported property "foo" accessed')
    warnOnce('workspace-shim::unknownProp::foo', 'unsupported property "foo" accessed')

    expect(warn).toHaveBeenCalledOnce()
  })

  it('shares dedup state with warnNoOp keys', () => {
    warnNoOp('ItemView', 'addAction')
    warnOnce('no-op::ItemView::addAction', 'should be suppressed')

    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('debugOnce', () => {
  let debug: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetLogDedup()
    debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    debug.mockRestore()
  })

  it('logs at debug level, once per key', () => {
    debugOnce('workspace-shim::splitPane', 'split panes are not supported, opened a new tab instead')
    debugOnce('workspace-shim::splitPane', 'split panes are not supported, opened a new tab instead')

    expect(debug).toHaveBeenCalledOnce()
  })
})
