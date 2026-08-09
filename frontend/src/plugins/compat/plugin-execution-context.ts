/**
 * Tracks which plugin's code is currently executing on the call stack.
 *
 * DOM-creation helpers (createEl/createDiv/createSpan) use this to tag the
 * elements they produce with `data-plugin-id` — including when a plugin
 * inserts elements into shared workspace DOM (toolbars, popovers) rather than
 * its own view container. Without this, CssInjector's [data-plugin-id]
 * ancestor scoping can never match those elements, and the plugin's own
 * stylesheet silently fails to apply to anything it builds there.
 *
 * All plugins run in the same JS realm (no iframes/workers), so a single
 * module-level variable with save/restore is sufficient for SYNCHRONOUS
 * nesting — reentrant-safe since JS is single-threaded. It does NOT survive
 * `await` boundaries: an async onload() that awaits something before calling
 * e.g. `workspace.onLayoutReady(...)` resumes after this module has already
 * unwound the context back to null (worse, unrelated plugins' code may have
 * run and re-set/cleared it in between). For call sites whose pluginId is
 * knowable up front rather than only via "whatever's currently running",
 * prefer `scopeForPlugin()` below — it binds the id into a closure once,
 * so it's correct regardless of how much async work happens before use.
 */

let currentPluginId: string | null = null

/**
 * Callback registered by the active PluginSandbox so the global setTimeout/
 * setInterval override (install-globals.ts) can record a scheduled timer
 * against the plugin that scheduled it. Without this, sandbox.cleanup()'s
 * timer-clearing loop always operates on an empty set — nothing schedules
 * through the sandbox's own (unused) createSetTimeoutProxy — so a plugin's
 * pending timers (e.g. Excalidraw's autosave/prevent-reload resets) keep
 * firing after the plugin has been unloaded and torn down.
 */
let timerTracker: ((pluginId: string, timerId: number) => void) | null = null

/** Register the sandbox's timer-tracking callback. Pass null to unregister. */
export function setTimerTracker(tracker: ((pluginId: string, timerId: number) => void) | null): void {
  timerTracker = tracker
}

/** Record that `pluginId` scheduled `timerId`, so it can be cancelled on unload. */
export function trackPluginTimer(pluginId: string, timerId: number): void {
  timerTracker?.(pluginId, timerId)
}

/** Run `fn` with `pluginId` marked as the currently executing plugin. */
export function withPluginContext<T>(pluginId: string | null, fn: () => T): T {
  if (!pluginId) return fn()
  const previous = currentPluginId
  currentPluginId = pluginId
  try {
    return fn()
  } finally {
    currentPluginId = previous
  }
}

/** The plugin currently executing on the call stack, or null outside plugin code. */
export function getCurrentPluginId(): string | null {
  return currentPluginId
}

/**
 * Like withPluginContext(), but for an async `fn` — holds `pluginId` as the
 * current plugin for `fn`'s entire async lifetime (every internal `await`),
 * not just its first synchronous chunk.
 *
 * withPluginContext()'s plain try/finally resets the context as soon as `fn()`
 * *returns* — which, for an async function, is as soon as it hits its first
 * `await`, long before the rest of its body (and any createEl() calls in it)
 * actually runs. A plugin whose async onload() does `await this.loadSettings()`
 * before building DOM loses its tag on everything built afterward, even though
 * it's all still "the same onload() call". Awaiting `fn()` here instead means
 * the `finally` only runs once the whole async call — including every await
 * inside it — has settled.
 *
 * Only safe at a call site known to run exclusively for one plugin at a time
 * (e.g. activatePlugin() awaiting one plugin's onload() before the next plugin
 * starts) — unlike withPluginContext(), this does NOT nest safely with
 * unrelated plugin activity that happens to run during one of `fn`'s awaits
 * (e.g. another already-active plugin's event listener firing mid-await would
 * see the wrong currentPluginId). Prefer withPluginContext() elsewhere.
 */
export async function withPluginContextAsync<T>(pluginId: string | null, fn: () => Promise<T> | T): Promise<T> {
  if (!pluginId) return fn()
  const previous = currentPluginId
  currentPluginId = pluginId
  try {
    return await fn()
  } finally {
    currentPluginId = previous
  }
}

/**
 * Wrap an object so that calls to the given method names always run with
 * `pluginId` set as the current plugin — including any callback argument
 * they're given, which is itself wrapped so *its* later invocation (e.g. an
 * event firing, a deferred onLayoutReady callback) also carries the context.
 * All other methods/properties pass through unchanged.
 *
 * Use this for per-plugin-bound objects (like each plugin's `app.workspace`)
 * where the pluginId is known for certain at creation time — sidesteps the
 * async-boundary problem entirely, since nothing here depends on "what's
 * currently running" at call time.
 */
export function scopeForPlugin<T extends object>(
  target: T,
  pluginId: string,
  callbackWrappingMethods: readonly (keyof T)[]
): T {
  return new Proxy(target, {
    get(obj, prop, receiver): unknown {
      const value = Reflect.get(obj, prop, receiver)
      if (typeof value !== 'function') return value
      const bound = value.bind(obj)
      if (!callbackWrappingMethods.includes(prop as keyof T)) return bound
      return (...args: unknown[]) => {
        const wrappedArgs = args.map(arg =>
          typeof arg === 'function'
            ? (...cbArgs: unknown[]) => withPluginContext(pluginId, () => (arg as (...a: unknown[]) => unknown)(...cbArgs))
            : arg
        )
        return withPluginContext(pluginId, () => bound(...wrappedArgs))
      }
    },
  })
}
