/**
 * Unit tests for the async lifecycle containment helpers.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { containAsyncLoad, containAsyncUnload, takePendingUnload } from './async-lifecycle'

/** Collect rejections that escaped to the global handler during `run`. */
async function collectUnhandledRejections(run: () => Promise<void> | void): Promise<unknown[]> {
  const rejections: unknown[] = []
  const capture = (event: PromiseRejectionEvent): void => { rejections.push(event.reason) }
  window.addEventListener('unhandledrejection', capture)
  await run()
  await new Promise(resolve => setTimeout(resolve, 0))
  window.removeEventListener('unhandledrejection', capture)
  return rejections
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('containAsyncUnload', () => {
  it('parks a pending promise on the owner so callers can await the teardown', async () => {
    const owner = {}
    let settled = false
    containAsyncUnload(owner, 'test-plugin', (async () => {
      await Promise.resolve()
      settled = true
    })())

    const pending = takePendingUnload(owner)
    expect(pending).toBeDefined()
    await pending
    expect(settled).toBe(true)
  })

  it('hands the parked promise over only once', () => {
    const owner = {}
    containAsyncUnload(owner, 'test-plugin', Promise.resolve())

    expect(takePendingUnload(owner)).toBeDefined()
    expect(takePendingUnload(owner)).toBeUndefined()
  })

  it('ignores a synchronous (void) onunload', () => {
    const owner = {}
    containAsyncUnload(owner, 'test-plugin', undefined)

    expect(takePendingUnload(owner)).toBeUndefined()
  })

  it('logs a rejection instead of leaking it, and still resolves the parked promise', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const owner = {}

    const rejections = await collectUnhandledRejections(async () => {
      containAsyncUnload(owner, 'test-plugin', Promise.reject(new Error('boom')))
      await expect(takePendingUnload(owner)).resolves.toBeUndefined()
    })

    expect(rejections).toEqual([])
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Async unload of "test-plugin" rejected'),
      expect.any(Error)
    )
  })

  it('contains a rejection even when nothing ever takes the pending promise', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const rejections = await collectUnhandledRejections(() => {
      containAsyncUnload(undefined, 'child component', Promise.reject(new Error('boom')))
    })

    expect(rejections).toEqual([])
    expect(consoleError).toHaveBeenCalledTimes(1)
  })
})

describe('containAsyncLoad', () => {
  it('logs a rejecting async onload without parking anything', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const owner = {}

    const rejections = await collectUnhandledRejections(() => {
      containAsyncLoad('test-plugin', Promise.reject(new Error('boom')))
    })

    expect(rejections).toEqual([])
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Async load of "test-plugin" rejected'),
      expect.any(Error)
    )
    expect(takePendingUnload(owner)).toBeUndefined()
  })

  it('ignores a synchronous (void) onload', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    containAsyncLoad('test-plugin', undefined)
    await Promise.resolve()

    expect(consoleError).not.toHaveBeenCalled()
  })
})
