/**
 * Shared console logging helpers for the plugin compatibility layer.
 *
 * Severity is meaningful here, not decorative:
 * - `debugOnce`/`debugLog` — a deliberate compatibility trade-off (e.g. a
 *   feature that intentionally has no Slatebase equivalent). Expected, not
 *   actionable.
 * - `warnOnce`/`warnLog` — a real gap: something a plugin asked for that we
 *   don't support, or input we rejected. Worth a developer's attention.
 * - `console.error` is used directly at call sites for exceptions/failures
 *   and is not wrapped here.
 *
 * Many of these call sites sit in render or event paths that can fire often
 * (once per keystroke, per proxied request, per property access). The
 * `*Once` variants dedupe by an explicit key so a single cause logs a single
 * line per session instead of flooding the console.
 *
 * @module log
 */

const seen = new Set<string>()

function once(level: 'debug' | 'warn' | 'error', key: string, message: string, ...args: unknown[]): void {
  if (seen.has(key)) return
  seen.add(key)
  console[level](message, ...args)
}

/** Log a deliberate compatibility trade-off. Not deduped — call at points that already fire at most once per relevant event. */
export function debugLog(message: string, ...args: unknown[]): void {
  console.debug(message, ...args)
}

/** Log a deliberate compatibility trade-off, once per `key` per session. */
export function debugOnce(key: string, message: string, ...args: unknown[]): void {
  once('debug', key, message, ...args)
}

/** Log a real compatibility gap. Not deduped — call at points that already fire at most once per relevant event. */
export function warnLog(message: string, ...args: unknown[]): void {
  console.warn(message, ...args)
}

/** Log a real compatibility gap, once per `key` per session. */
export function warnOnce(key: string, message: string, ...args: unknown[]): void {
  once('warn', key, message, ...args)
}

/**
 * Log an exception/failure, once per `key` per session.
 *
 * For failures that can recur on every render or event of a broken plugin
 * (a widget re-drawn on scroll, a handler re-invoked per keystroke) — deduping
 * keeps the first, actionable occurrence without letting a stuck plugin drown
 * out the rest of the console.
 */
export function errorOnce(key: string, message: string, ...args: unknown[]): void {
  once('error', key, message, ...args)
}

/**
 * Warn once that a no-op API was called.
 *
 * Large parts of the Obsidian API are present so plugins do not crash, but
 * do nothing. Silently returning is the worst outcome: the plugin appears to
 * work and simply has no effect, which is very hard to diagnose from the
 * outside — so this is a `warnOnce`, not a `debugOnce`.
 *
 * @param scope - Who called it: a plugin id where known, otherwise the shim name
 * @param method - The unimplemented method, without parentheses
 * @param detail - Optional note on what the caller loses by this being a no-op
 */
export function warnNoOp(scope: string, method: string, detail?: string): void {
  const suffix = detail ? ` ${detail}` : ''
  warnOnce(
    `no-op::${scope}::${method}`,
    `[PluginCompat] ${scope} called ${method}(), which is not implemented in Slatebase.${suffix}`,
  )
}

/** Reset all dedup state. Test-only. */
export function resetLogDedup(): void {
  seen.clear()
}
