import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetLogDedup } from './log'
import { createVimAdapter } from './vim-adapter'

type Api = Record<string, (...args: unknown[]) => unknown>

afterEach(() => {
  resetLogDedup()
  vi.restoreAllMocks()
})

/** An engine whose load the test releases by hand. */
function controlledEngine(api: Api) {
  let loaded = false
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  const load = vi.fn(async () => { await gate; loaded = true; return api })
  return { engine: { get: () => (loaded ? api : null), load }, release, load }
}

describe('CodeMirrorAdapter.Vim', () => {
  it('delegates straight to the engine once it is loaded', () => {
    const defineAction = vi.fn(() => 'done')
    const adapter = createVimAdapter({ get: () => ({ defineAction }), load: async () => ({}) }) as Api
    expect(adapter['defineAction']!('a', 1)).toBe('done')
    expect(defineAction).toHaveBeenCalledWith('a', 1)
  })

  it('remembers definitions made before the load and replays them in order', async () => {
    const calls: string[] = []
    const api: Api = {
      defineAction: (name) => { calls.push(`action:${String(name)}`) },
      mapCommand: (keys) => { calls.push(`map:${String(keys)}`) },
    }
    const { engine, release, load } = controlledEngine(api)
    const adapter = createVimAdapter(engine) as Api
    adapter['defineAction']!('outlinerO')
    adapter['mapCommand']!('o')
    adapter['defineAction']!('outlinerBigO')
    expect(calls).toEqual([])
    expect(load).toHaveBeenCalledTimes(1)
    release()
    await vi.waitFor(() => expect(calls).toEqual(['action:outlinerO', 'map:o', 'action:outlinerBigO']))
  })

  it('runs what was queued before a direct call when the engine got loaded by someone else', () => {
    const calls: string[] = []
    const api: Api = {
      defineAction: (name) => { calls.push(`action:${String(name)}`) },
      mapCommand: (keys) => { calls.push(`map:${String(keys)}`) },
    }
    let ready = false
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const adapter = createVimAdapter({ get: () => (ready ? api : null), load: async () => { await gate; return api } }) as Api
    adapter['defineAction']!('a')
    // The editor loads the engine first; the adapter's own load has not finished yet.
    ready = true
    adapter['mapCommand']!('k')
    expect(calls).toEqual(['action:a', 'map:k'])
    release()
  })

  it('drops (and logs) a call that needs a live editor while the engine is not loaded', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { engine, load } = controlledEngine({})
    const adapter = createVimAdapter(engine) as Api
    expect(adapter['handleEx']!({}, 'w')).toBeUndefined()
    expect(debug).toHaveBeenCalledTimes(1)
    expect(load).not.toHaveBeenCalled()
  })

  it('says so when the engine has no such method', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const adapter = createVimAdapter({ get: () => ({}), load: async () => ({}) }) as Api
    expect(adapter['enterInsertMode']!()).toBeUndefined()
    expect(debug.mock.calls[0]?.[0]).toContain('Vim.enterInsertMode() does not exist')
  })

  it('warns once and drops the queue when the engine cannot be loaded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = createVimAdapter({ get: () => null, load: async () => { throw new Error('offline') } }) as Api
    adapter['defineAction']!('x')
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1))
  })

  it('is not mistaken for a promise', async () => {
    const adapter = createVimAdapter({ get: () => ({}), load: async () => ({}) })
    expect(await Promise.resolve(adapter)).toBe(adapter)
  })

  it('reaches the real engine when nothing is injected', async () => {
    const adapter = createVimAdapter() as Api
    const seen: unknown[] = []
    adapter['defineAction']!('slatebaseTestAction', (..._args: unknown[]) => { seen.push(1) })
    // The real module loads lazily; once it has, the same call goes straight through.
    await vi.waitFor(() => {
      expect(() => adapter['defineAction']!('slatebaseTestAction2', () => {})).not.toThrow()
    })
  })
})
