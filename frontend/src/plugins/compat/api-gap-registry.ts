/**
 * Registry of Obsidian APIs that plugins reached for but Slatebase does not emulate.
 *
 * The App and Workspace shims wrap their instances in a Proxy whose `get` trap
 * returns a callable no-op for any property that is not explicitly emulated. That
 * keeps plugins from crashing, but it means every gap is invisible: the console
 * warning scrolls away and nothing is left to inspect afterwards.
 *
 * This registry keeps that information. It records what was accessed, by which
 * plugin where attribution is possible, and — crucially — whether the no-op was
 * merely *read* or actually *called*:
 *
 * - a read alone is often harmless feature detection
 * - a call means the plugin expected something to happen and nothing did
 *
 * That distinction is what separates a gap worth implementing from one nobody
 * depends on. Inspect it at runtime via `window.__slatebasePluginApiGaps()`.
 *
 * Note: this does not change what the proxies return. The no-op stays callable
 * and therefore truthy, so `if (workspace.someUnknownThing)` still takes the
 * wrong branch. Making the gaps enumerable is the prerequisite for deciding
 * which of them to close.
 *
 * @module api-gap-registry
 */

/** Which shim the missing API was reached for on. */
export type GapShim = 'App' | 'Workspace' | 'Vault' | 'MetadataCache' | 'FileManager' | 'WorkspaceLeaf'

/** One unimplemented API, aggregated across accesses. */
export interface ApiGap {
  /** Shim the property was accessed on. */
  shim: GapShim
  /** The property or method name the plugin asked for. */
  property: string
  /**
   * Plugin that triggered it, or `'unknown'`. The Workspace shim is shared
   * across all plugins, so its gaps cannot be attributed to one.
   */
  pluginId: string
  /** How often the property was read. */
  reads: number
  /** How often the returned no-op was actually invoked. */
  calls: number
}

const gaps = new Map<string, ApiGap>()

function keyOf(shim: GapShim, property: string, pluginId: string): string {
  return `${shim}::${pluginId}::${property}`
}

function entryFor(shim: GapShim, property: string, pluginId: string): ApiGap {
  const key = keyOf(shim, property, pluginId)
  let gap = gaps.get(key)
  if (!gap) {
    gap = { shim, property, pluginId, reads: 0, calls: 0 }
    gaps.set(key, gap)
  }
  return gap
}

/**
 * Record that a non-emulated property was read.
 *
 * @returns `true` the first time this property is seen, so the caller can log
 *          once instead of on every access.
 */
export function recordGapRead(
  shim: GapShim,
  property: string,
  pluginId = 'unknown',
): boolean {
  const gap = entryFor(shim, property, pluginId)
  gap.reads++
  return gap.reads === 1
}

/**
 * Record that the no-op returned for a non-emulated property was invoked.
 *
 * @returns `true` the first time this property is called.
 */
export function recordGapCall(
  shim: GapShim,
  property: string,
  pluginId = 'unknown',
): boolean {
  const gap = entryFor(shim, property, pluginId)
  gap.calls++
  return gap.calls === 1
}

/** All recorded gaps, most-invoked first, then most-read. */
export function getApiGaps(): ApiGap[] {
  return [...gaps.values()].sort(
    (a, b) => b.calls - a.calls || b.reads - a.reads || a.property.localeCompare(b.property),
  )
}

/** Gaps triggered by one plugin. */
export function getApiGapsForPlugin(pluginId: string): ApiGap[] {
  return getApiGaps().filter((g) => g.pluginId === pluginId)
}

/** Drop all recorded gaps. Used on vault switch and in tests. */
export function clearApiGaps(): void {
  gaps.clear()
}

/**
 * Expose the registry for debugging, alongside the other `window.__slatebase*`
 * hooks. Idempotent.
 */
export function installApiGapInspector(): void {
  if (typeof window === 'undefined') return
  const win = window as unknown as Record<string, unknown>
  win['__slatebasePluginApiGaps'] ??= getApiGaps
}
