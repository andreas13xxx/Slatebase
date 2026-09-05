/**
 * Containment for lifecycle hooks a plugin declared `async`.
 *
 * Obsidian's `Component.load()`/`unload()` are synchronous and return `void`,
 * but plenty of real plugins write `async onload()` / `async onunload()`. The
 * promise those return is dropped on the floor by every caller, so a rejection
 * inside the *asynchronous* part of a teardown surfaces as a bare
 * "Uncaught (in promise)" with no plugin id attached — and, during a vault
 * switch, lands after we have already moved on to rebuilding the next vault's
 * plugin system.
 *
 * Observed with obsidian-livesync: its `onunload()` awaits its way into
 * `getActiveReplicator()`, which fails and calls `showError()` against a notice
 * manager its own teardown had already disposed. A plugin misbehaving in its
 * own teardown must stay its problem — it may not escape as an uncaught
 * rejection, and it may not outlive the unload it belongs to.
 *
 * So: every lifecycle call site hands the returned value here. Non-thenables
 * pass through untouched (the overwhelmingly common case). A thenable gets a
 * rejection handler that logs with the owner's label, and — for unloads — is
 * parked on the instance so `PluginLoader.deactivatePlugin()` can await it
 * (bounded) before tearing the sandbox down underneath it.
 *
 * @module async-lifecycle
 */

/** Pending async unloads, keyed by the component/plugin instance being unloaded. */
const pendingUnloads = new WeakMap<object, Promise<void>>()

/** Narrow an unknown lifecycle return value to something awaitable. */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' && value !== null || typeof value === 'function')
    && typeof (value as { then?: unknown }).then === 'function'
  )
}

/**
 * Contain the result of an `onload()`/`load()` call.
 *
 * A rejection is logged rather than left to the global unhandledrejection
 * handler. Nothing is parked: activation already awaits the plugin's own
 * `onload()` promise in the loader (see `activatePlugin`), and child components
 * have no caller that could wait for them.
 *
 * @param label - Human-readable owner for the log line (plugin id or class name)
 * @param result - Whatever the lifecycle method returned
 */
export function containAsyncLoad(label: string, result: unknown): void {
  if (!isThenable(result)) return
  void Promise.resolve(result).then(undefined, (err: unknown) => {
    console.error(`[async-lifecycle] Async load of "${label}" rejected:`, err)
  })
}

/**
 * Contain the result of an `onunload()`/`unload()` call.
 *
 * The rejection handler is attached immediately, so the promise can never be an
 * uncaught rejection. When `owner` is given, the settled (never-rejecting)
 * promise is parked on it for `takePendingUnload()` to await.
 *
 * @param owner - The instance being unloaded, or undefined to only contain
 * @param label - Human-readable owner for the log line (plugin id or class name)
 * @param result - Whatever the lifecycle method returned
 */
export function containAsyncUnload(owner: object | undefined, label: string, result: unknown): void {
  if (!isThenable(result)) return
  const settled = Promise.resolve(result).then(
    () => {},
    (err: unknown) => {
      console.error(`[async-lifecycle] Async unload of "${label}" rejected:`, err)
    }
  )
  if (owner) pendingUnloads.set(owner, settled)
}

/**
 * Take the pending async unload parked on an instance, if any.
 *
 * Removes it as it hands it over: a later unload of the same instance parks a
 * fresh one, and nothing should await the same teardown twice.
 *
 * @param owner - The instance that was unloaded
 * @returns A promise that resolves once the async teardown settles, or undefined
 */
export function takePendingUnload(owner: object): Promise<void> | undefined {
  const pending = pendingUnloads.get(owner)
  if (pending) pendingUnloads.delete(owner)
  return pending
}
