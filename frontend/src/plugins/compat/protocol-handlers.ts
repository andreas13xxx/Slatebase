/**
 * `obsidian://` protocol handlers.
 *
 * A web app cannot claim a URL scheme, so Slatebase receives the same call as an ordinary link into
 * the app: `/obsidian?action=<action>&<param>=<value>…` (see `deep-link/protocolAction.ts`).
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

interface Registration {
  owner: string
  handler: ProtocolHandler
}

/**
 * Every registration per action, oldest first; the last one is active. The owner lives with its
 * handler, so nothing a plugin does to `workspace.protocolHandlers` can pair one plugin's identity
 * with another plugin's function.
 */
const registrations = new Map<string, Registration[]>()

/**
 * `workspace.protocolHandlers`: a read-through copy of the active handlers, for plugins that read
 * it. Writing to it changes nothing here — a handler only runs if it was registered through
 * {@link registerProtocolHandler}.
 */
export const protocolHandlerMap = new Map<string, ProtocolHandler>()

function active(action: string): Registration | undefined {
  return registrations.get(action)?.at(-1)
}

function syncMirror(action: string): void {
  const current = active(action)
  if (current) protocolHandlerMap.set(action, current.handler)
  else protocolHandlerMap.delete(action)
}

/**
 * Registers a handler for `action`. A later registration of the same action takes over; when it is
 * unloaded again, the earlier one is active again.
 */
export function registerProtocolHandler(pluginId: string, action: string, handler: ProtocolHandler): void {
  if (typeof handler !== 'function' || typeof action !== 'string' || action === '') {
    warnOnce(`protocol:${pluginId}:invalid`, `[PluginCompat] ${pluginId} called registerObsidianProtocolHandler with an invalid action or handler; ignored.`)
    return
  }
  const stack = (registrations.get(action) ?? []).filter((entry) => entry.owner !== pluginId)
  const previous = stack.at(-1)
  if (previous) {
    warnOnce(`protocol:${action}:replaced`, `[PluginCompat] ${pluginId} replaced the obsidian://${action} handler of ${previous.owner}.`)
  }
  stack.push({ owner: pluginId, handler })
  registrations.set(action, stack)
  syncMirror(action)
  debugOnce(`protocol:${pluginId}:${action}`, `[PluginCompat] ${pluginId} handles /obsidian?action=${action}.`)
}

/** Drops every handler a plugin registered (on unload); an earlier plugin's handler for the same action takes over again. */
export function unregisterProtocolHandlersForPlugin(pluginId: string): void {
  for (const [action, stack] of [...registrations]) {
    const rest = stack.filter((entry) => entry.owner !== pluginId)
    if (rest.length === stack.length) continue
    if (rest.length === 0) registrations.delete(action)
    else registrations.set(action, rest)
    syncMirror(action)
  }
}

/** Drops all handlers (plugin system teardown). */
export function clearProtocolHandlers(): void {
  registrations.clear()
  protocolHandlerMap.clear()
}

/** The plugin whose handler is active for `action`, or `null`. */
export function protocolHandlerOwner(action: string): string | null {
  return active(action)?.owner ?? null
}

/**
 * Runs the active handler of `action` with the link's parameters, as the owning plugin.
 *
 * @param expectedOwner - When given, the handler only runs if this plugin still owns the action:
 *   the user agreed to that plugin, not to whichever one registered since.
 * @returns false when no plugin handles the action (or the owner changed); a handler that throws or
 *   rejects is logged, not rethrown.
 */
export async function runProtocolHandler(action: string, params: ProtocolParams, expectedOwner?: string): Promise<boolean> {
  const current = active(action)
  if (!current) return false
  if (expectedOwner !== undefined && current.owner !== expectedOwner) return false
  try {
    await withPluginContext(current.owner, () => current.handler({ ...params, action }))
  } catch (error) {
    console.error(`[PluginCompat] ${current.owner}: obsidian://${action} handler failed:`, error)
  }
  return true
}
