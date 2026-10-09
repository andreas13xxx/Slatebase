/**
 * BasesViewRegistry — Obsidian-compatible `Plugin.registerBasesView()` backing store.
 *
 * Bases is Obsidian's database/table view over a vault's metadata (`.base`
 * files, API since 1.10.0). Slatebase renders `.base` files itself with its
 * own built-in table (see `components/bases/`), but Obsidian also lets a
 * third-party plugin contribute its OWN Bases view type (a card view, a
 * calendar view, …) via `Plugin.registerBasesView(viewId, registration)`.
 *
 * This module is the registry those registrations land in — the same
 * module-level `Map` pattern as `view-registry.ts`/`embed-registry.ts`.
 * `BasesView.tsx` consults it: when a `.base` file's active view `type`
 * matches a registration here, the plugin's factory is called and its view is
 * mounted (via `BasesPluginViewHost`) instead of the built-in table; when it
 * does not, the built-in table renders unchanged.
 *
 * Registrations are per-plugin so they can be torn down on plugin
 * deactivation (`clearForPlugin`) and on vault switch (`resetForVault`),
 * mirroring every other per-plugin registry.
 *
 * @module bases-view-registry
 */

import { warnOnce } from './log'

/**
 * A view instance a plugin's factory produces. Mirrors the lifecycle surface
 * of Obsidian's `BasesView` (which `extends Component`): `load()` runs
 * `onload()`, `unload()` runs `onunload()`, and `onDataUpdated()` is called
 * whenever fresh query data is available. `type` is the view-type id. The
 * remaining Bases-specific fields (`app`, `config`, `allProperties`, `data`)
 * are written onto the instance by the host before `onDataUpdated()` — we
 * keep the shape loose here because the concrete classes live in
 * `install-globals.ts` and plugin subclasses add their own fields.
 */
export interface BasesViewInstance {
  type?: string
  load?(): void
  unload?(): void
  onload?(): void
  onunload?(): void
  onDataUpdated?(): void
  [key: string]: unknown
}

/**
 * The factory a plugin passes to `registerBasesView`. Obsidian's
 * `BasesViewFactory = (controller: QueryController, containerEl: HTMLElement)
 * => BasesView`. The `controller` is the opaque `QueryController` the view
 * reads its data through; `containerEl` is the scoped element to render into.
 */
export type BasesViewFactory = (controller: unknown, containerEl: HTMLElement) => BasesViewInstance

/**
 * The registration object. Mirrors Obsidian's `BasesViewRegistration`:
 * a user-facing `name`, an `icon` for the view selector, the `factory`, and
 * optional `options` describing per-view config controls (unused by Slatebase
 * today — we render the view, not an options toolbar — but preserved so a
 * plugin that supplies it is not treated as incompatible).
 */
export interface BasesViewRegistration {
  name: string
  icon?: string
  factory: BasesViewFactory
  options?: unknown
}

/** A registration plus the id of the plugin that owns it. */
interface OwnedRegistration {
  registration: BasesViewRegistration
  pluginId: string
}

/** view-type id → { registration, pluginId }. Module-level, shared across the app. */
const registrations = new Map<string, OwnedRegistration>()

/**
 * Register a Bases view type under `viewId`. Returns `true` if it was stored,
 * `false` if the id was already taken (Obsidian's `registerBasesView` returns
 * a boolean; a duplicate id does not overwrite the earlier registration).
 */
export function registerBasesView(viewId: string, registration: BasesViewRegistration, pluginId: string): boolean {
  if (!viewId || typeof registration?.factory !== 'function') {
    warnOnce(`BasesViewRegistry.invalid:${pluginId}:${viewId}`, `[BasesViewRegistry] Plugin "${pluginId}" called registerBasesView with an invalid id or factory; ignored.`)
    return false
  }
  if (registrations.has(viewId)) {
    warnOnce(`BasesViewRegistry.dup:${viewId}`, `[BasesViewRegistry] Bases view type "${viewId}" is already registered; the later registration from "${pluginId}" is ignored.`)
    return false
  }
  registrations.set(viewId, { registration, pluginId })
  return true
}

/** Look up a registration by its view-type id, or `null` when none matches. */
export function getBasesViewRegistration(viewId: string): BasesViewRegistration | null {
  return registrations.get(viewId)?.registration ?? null
}

/**
 * Look up a registration together with its owning plugin id — needed by the
 * host component so the mounted view's container can carry the right
 * `data-plugin-id` for CSS scoping. Returns `null` when none matches.
 */
export function getBasesViewRegistrationWithOwner(viewId: string): { registration: BasesViewRegistration; pluginId: string } | null {
  const owned = registrations.get(viewId)
  return owned ? { registration: owned.registration, pluginId: owned.pluginId } : null
}

/** True if any plugin has registered a Bases view type under `viewId`. */
export function hasBasesViewRegistration(viewId: string): boolean {
  return registrations.has(viewId)
}

/** All registered view-type ids with their display names, for a view switcher. */
export function listBasesViewRegistrations(): Array<{ viewId: string; name: string; icon?: string }> {
  return Array.from(registrations.entries()).map(([viewId, { registration }]) => {
    const entry: { viewId: string; name: string; icon?: string } = { viewId, name: registration.name }
    if (registration.icon !== undefined) entry.icon = registration.icon
    return entry
  })
}

/** Remove every registration owned by one plugin (on plugin deactivation). */
export function clearForPlugin(pluginId: string): void {
  for (const [viewId, owned] of registrations) {
    if (owned.pluginId === pluginId) registrations.delete(viewId)
  }
}

/** Clear all registrations (on vault switch / test reset). */
export function resetForVault(): void {
  registrations.clear()
}
