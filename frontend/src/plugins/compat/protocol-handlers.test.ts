import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentPluginId } from './plugin-execution-context'
import { resetLogDedup } from './log'
import {
  clearProtocolHandlers,
  protocolHandlerMap,
  protocolHandlerOwner,
  registerProtocolHandler,
  runProtocolHandler,
  unregisterProtocolHandlersForPlugin,
} from './protocol-handlers'

afterEach(() => {
  clearProtocolHandlers()
  resetLogDedup()
  vi.restoreAllMocks()
})

describe('protocol handlers', () => {
  it('runs the handler as its plugin with the action and the link parameters', async () => {
    let seenPlugin: string | null = null
    const handler = vi.fn(() => { seenPlugin = getCurrentPluginId() })
    registerProtocolHandler('demo', 'auth', handler)
    expect(protocolHandlerOwner('auth')).toBe('demo')
    expect(await runProtocolHandler('auth', { code: 'abc' })).toBe(true)
    expect(handler).toHaveBeenCalledWith({ code: 'abc', action: 'auth' })
    expect(seenPlugin).toBe('demo')
  })

  it('reports an action nobody handles', async () => {
    expect(await runProtocolHandler('nothing', {})).toBe(false)
  })

  it('does not run a handler written straight into workspace.protocolHandlers (no owner)', async () => {
    const handler = vi.fn()
    protocolHandlerMap.set('rogue', handler)
    expect(await runProtocolHandler('rogue', {})).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('logs a failing handler instead of throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerProtocolHandler('demo', 'boom', () => { throw new Error('nope') })
    expect(await runProtocolHandler('boom', {})).toBe(true)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('drops a plugin\'s handlers on unload, and only its own', () => {
    registerProtocolHandler('a', 'one', () => {})
    registerProtocolHandler('b', 'two', () => {})
    unregisterProtocolHandlersForPlugin('a')
    expect(protocolHandlerOwner('one')).toBeNull()
    expect(protocolHandlerOwner('two')).toBe('b')
  })

  it('ignores an invalid registration with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    registerProtocolHandler('demo', '', () => {})
    registerProtocolHandler('demo', 'x', 'not a function' as never)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(protocolHandlerMap.size).toBe(0)
  })
})
