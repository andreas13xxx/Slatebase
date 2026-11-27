/**
 * `window.CodeMirrorAdapter.Vim`: what Obsidian plugins reach for to hook into Vim
 * (obsidian-outliner's `Vim.defineAction` / `Vim.mapCommand`, Vimrc-style plugins' `Vim.map`).
 *
 * In Obsidian this is `@replit/codemirror-vim`'s global `Vim` API, and in Slatebase it is the same
 * object: every call goes to the engine that `vimMode` (app.json) turns on. The engine is loaded on
 * demand, so a call that arrives first — plugins register on load, before any editor is open — is
 * remembered and replayed, in order, once the module is there. Calls that only make sense with a
 * live editor (`handleEx`, …) cannot wait: before the engine is loaded they are logged and dropped.
 *
 * @module plugins/compat/vim-adapter
 */
import { getLoadedVimApi, loadVimModule } from '../../editor/vim-mode'
import { debugOnce, warnOnce } from './log'

/** Definitions and mappings: safe to run later, and plugins make them while loading. */
const REPLAYABLE = new Set([
  'defineAction', 'mapCommand', 'map', 'noremap', 'unmap', 'mapclear', 'defineEx', 'defineOperator',
  'defineMotion', 'defineOption', 'defineRegister', 'setOption', 'defineSession',
])

type VimApi = Record<string, unknown>

/**
 * Builds the `Vim` object. `engine` is injectable for tests; by default it is the lazily loaded
 * `@replit/codemirror-vim`.
 */
export function createVimAdapter(engine: {
  get: () => VimApi | null
  load: () => Promise<VimApi>
} = {
  get: () => getLoadedVimApi() as unknown as VimApi | null,
  load: async () => (await loadVimModule()).Vim as unknown as VimApi,
}): object {
  const pending: Array<[string, unknown[]]> = []
  let loading = false

  const run = (api: VimApi, method: string, args: unknown[]): unknown => {
    const fn = api[method]
    if (typeof fn !== 'function') {
      debugOnce(`vim::${method}`, `[PluginCompat] Vim.${method}() does not exist in the Vim engine Slatebase ships; ignored.`)
      return undefined
    }
    return (fn as (...a: unknown[]) => unknown).apply(api, args)
  }

  const flush = (api: VimApi): void => {
    for (const [method, args] of pending.splice(0)) {
      try {
        run(api, method, args)
      } catch (error) {
        warnOnce(`vim::replay::${method}`, `[PluginCompat] Vim.${method}() failed when replayed after the Vim engine loaded:`, error)
      }
    }
  }

  const startLoading = (): void => {
    if (loading) return
    loading = true
    engine.load().then(flush, (error: unknown) => {
      loading = false
      pending.length = 0
      warnOnce('vim::load', '[PluginCompat] The Vim engine could not be loaded; Vim bindings a plugin registered are dropped.', error)
    })
  }

  return new Proxy({}, {
    get(_target, property) {
      // Not a method name: `then` would make the object look like a promise to `await`.
      if (typeof property !== 'string' || property === 'then') return undefined
      return (...args: unknown[]): unknown => {
        const api = engine.get()
        if (api) return run(api, property, args)
        if (REPLAYABLE.has(property)) {
          pending.push([property, args])
          startLoading()
          return undefined
        }
        debugOnce(
          `vim::${property}`,
          `[PluginCompat] Vim.${property}() needs the Vim engine, which is not loaded yet (turn on "Vim key bindings" in Settings); ignored.`,
        )
        return undefined
      }
    },
  })
}
