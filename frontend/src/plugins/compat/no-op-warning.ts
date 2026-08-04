/**
 * One-time warnings for compatibility APIs that exist only as no-ops.
 *
 * Large parts of the Obsidian API are present so plugins do not crash, but do
 * nothing. Silently returning is the worst outcome: the plugin appears to work
 * and simply has no effect, which is very hard to diagnose from the outside.
 *
 * Warning on every call would flood the console (these sit in render paths), so
 * each scope/method pair warns exactly once per session.
 *
 * @module no-op-warning
 */

const warned = new Set<string>()

/**
 * Warn once that a no-op API was called.
 *
 * @param scope - Who called it: a plugin id where known, otherwise the shim name
 * @param method - The unimplemented method, without parentheses
 * @param detail - Optional note on what the caller loses by this being a no-op
 */
export function warnNoOp(scope: string, method: string, detail?: string): void {
  const key = `${scope}::${method}`
  if (warned.has(key)) return
  warned.add(key)

  const suffix = detail ? ` ${detail}` : ''
  console.warn(
    `[PluginCompat] ${scope} called ${method}(), which is not implemented in Slatebase.${suffix}`,
  )
}

/** Reset the dedup state. Test-only. */
export function resetNoOpWarnings(): void {
  warned.clear()
}
