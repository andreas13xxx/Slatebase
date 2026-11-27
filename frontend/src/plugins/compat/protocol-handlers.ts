/**
 * `obsidian://` protocol handlers.
 *
 * A web app cannot claim a URL scheme, so Slatebase receives the same call as an ordinary link into
 * the app: `/obsidian?action=<action>&<param>=<value>…` (see `deep-link/captureProtocolAction.ts`).
 * Plugins register handlers with `registerObsidianProtocolHandler(action, handler)`; this module
 * holds them and runs one when such a link was opened — never on its own: the caller (the signed-in
 * app) asks the user first, because a link is something anyone can send.
 *
 * @module protocol-handlers
 */
import { debugOnce, warnOnce } from './log'
import { withPluginContext } from './plugin-execution-context'

/** What a handler receives: the `action` plus every query parameter of the link, as strings. */
export type ProtocolParams = Record<string, string>

export type ProtocolHandler = (params: ProtocolParams) => unknown

/** Handlers by action; shared with `workspace.protocolHandlers`, which plugins may also read. */
export const protocolHandlerMap = new Map<string, ProtocolHandler>()

const owners = new Map<string, string>()

/** Registers a handler for `action`. A later registration of the same action replaces the earlier one. */
export function registerProtocolHandler(pluginId: string, action: string, handler: ProtocolHandler): void {
  if (typeof handler !== 'function' || typeof action !== 'string' || action === '') {
    warnOnce(`protocol:${pluginId}:invalid`, `[PluginCompat] ${pluginId} called registerObsidianProtocolHandler with an invalid action or handler; ignored.`)
    return
  }
  const previous = owners.get(action)
  if (previous !== undefined && previous !== pluginId) {
    warnOnce(`protocol:${action}:replaced`, `[PluginCompat] ${pluginId} replaced the obsidian://${action} handler of ${previous}.`)
  }
  protocolHandlerMap.set(action, handler)
  owners.set(action, pluginId)
  debugOnce(`protocol:${pluginId}:${action}`, `[PluginCompat] ${pluginId} handles /obsidian?action=${action}.`)
}

/** Drops every handler a plugin registered (on unload). */
export function unregisterProtocolHandlersForPlugin(pluginId: string): void {
  for (const [action, owner] of [...owners]) {
    if (owner !== pluginId) continue
    owners.delete(action)
    protocolHandlerMap.delete(action)
  }
}

/** Drops all handlers (plugin system teardown). */
export function clearProtocolHandlers(): void {
  protocolHandlerMap.clear()
  owners.clear()
}

/** The plugin that handles `action`, or `null`. */
export function protocolHandlerOwner(action: string): string | null {
  return protocolHandlerMap.has(action) ? owners.get(action) ?? null : null
}

/**
 * Runs the handler of `action` with the link's parameters, as the owning plugin.
 *
 * @returns false when no plugin handles the action; a handler that throws or rejects is logged, not rethrown.
 */
export async function runProtocolHandler(action: string, params: ProtocolParams): Promise<boolean> {
  const handler = protocolHandlerMap.get(action)
  const owner = owners.get(action)
  if (!handler || owner === undefined) return false
  try {
    await withPluginContext(owner, () => handler({ ...params, action }))
  } catch (error) {
    console.error(`[PluginCompat] ${owner}: obsidian://${action} handler failed:`, error)
  }
  return true
}
