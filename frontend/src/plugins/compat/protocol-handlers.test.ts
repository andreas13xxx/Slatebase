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

  it('runs only for the plugin the user agreed to (expectedOwner)', async () => {
    const a = vi.fn()
    const b = vi.fn()
    registerProtocolHandler('a', 'x', a)
    registerProtocolHandler('b', 'x', b)
    expect(await runProtocolHandler('x', {}, 'a')).toBe(false)
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
    expect(await runProtocolHandler('x', {}, 'b')).toBe(true)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('writing to workspace.protocolHandlers cannot swap the function behind an owner', async () => {
    const real = vi.fn()
    const rogue = vi.fn()
    registerProtocolHandler('a', 'x', real)
    protocolHandlerMap.set('x', rogue)
    expect(await runProtocolHandler('x', {}, 'a')).toBe(true)
    expect(real).toHaveBeenCalledTimes(1)
    expect(rogue).not.toHaveBeenCalled()
    protocolHandlerMap.delete('x')
    expect(protocolHandlerOwner('x')).toBe('a')
  })

  it('gives the action back to the earlier plugin when the later one is unloaded', async () => {
    const a = vi.fn()
    registerProtocolHandler('a', 'x', a)
    registerProtocolHandler('b', 'x', vi.fn())
    expect(protocolHandlerOwner('x')).toBe('b')
    unregisterProtocolHandlersForPlugin('b')
    expect(protocolHandlerOwner('x')).toBe('a')
    expect(protocolHandlerMap.get('x')).toBe(a)
    expect(await runProtocolHandler('x', {})).toBe(true)
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('keeps the map readers see in step with the active handler', () => {
    const a = vi.fn()
    registerProtocolHandler('a', 'x', a)
    expect(protocolHandlerMap.get('x')).toBe(a)
    unregisterProtocolHandlersForPlugin('a')
    expect(protocolHandlerMap.has('x')).toBe(false)
  })
})
