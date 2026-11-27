/**
 * metadataTypeManager — Obsidian's registry of frontmatter property types and
 * their widgets (undocumented API, but plugins such as Nested Properties and
 * obsidian-tasks build on it). One instance serves the whole window: the
 * property editor (sidebar, Live Preview, hover preview) and every plugin's
 * `app.metadataTypeManager` read and patch the same object, so a widget a
 * plugin registers — or a `getTypeInfo` it wraps — takes effect in the editor.
 */

import { createBuiltinPropertyWidgets, type PropertyWidget } from './property-widgets'
import { getCurrentPluginId } from './plugin-execution-context'

/** `{ expected, inferred }` widgets for a property and value (Obsidian's `getTypeInfo`). */
export interface PropertyTypeInfo {
  expected: PropertyWidget | undefined
  inferred: PropertyWidget | undefined
}

/** A type a plugin or the vault assigned to a property. */
export interface PropertyTypeAssignment {
  name: string
  type: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/** Slatebase's property type `list` is Obsidian's `multitext`; the other names match. */
export function toWidgetType(propertyType: string): string {
  return propertyType === 'list' ? 'multitext' : propertyType
}

/** Inverse of {@link toWidgetType}. */
export function fromWidgetType(widgetType: string): string {
  return widgetType === 'multitext' ? 'list' : widgetType
}

/** Obsidian ships these three with a fixed type; they are registered up front like in a real vault. */
const DEFAULT_PROPERTIES: Record<string, string> = { aliases: 'aliases', tags: 'tags', cssclasses: 'multitext' }

/** The manager object plugins receive as `app.metadataTypeManager`. */
export function createMetadataTypeManager() {
  const builtins = createBuiltinPropertyWidgets()
  const listeners = new Set<() => void>()
  let notifyQueued = false

  /** Coalesces bursts (a plugin registering two widgets) into one notification. */
  const notify = (): void => {
    if (notifyQueued) return
    notifyQueued = true
    queueMicrotask(() => {
      notifyQueued = false
      for (const listener of [...listeners]) listener()
    })
  }

  /** Which plugin a non-built-in widget came from, so its markup can be scoped to that plugin's CSS. */
  const owners = new WeakMap<PropertyWidget, string>()
  const claim = (candidate: PropertyWidget | undefined, pluginId: string | null): void => {
    if (candidate && pluginId !== null && !owners.has(candidate) && !Object.values(builtins).includes(candidate)) owners.set(candidate, pluginId)
  }

  // A proxy so `registeredTypeWidgets[type] = widget` / `delete` from a plugin reaches the editor.
  const registeredTypeWidgets = new Proxy<Record<string, PropertyWidget>>({ ...builtins }, {
    set(target, prop, value: PropertyWidget) {
      claim(value, getCurrentPluginId())
      target[prop as string] = value
      notify()
      return true
    },
    deleteProperty(target, prop) {
      delete target[prop as string]
      notify()
      return true
    },
  })

  const properties: Record<string, PropertyTypeAssignment> = Object.fromEntries(
    Object.entries(DEFAULT_PROPERTIES).map(([key, type]) => [key, { name: key, type }]),
  )
  /** Types from the vault's property-type registry, below what a plugin assigned. */
  let vaultTypes = new Map<string, string>()

  const hasWidget = (type: string): boolean => Object.hasOwn(registeredTypeWidgets, type)

  /** The unpatched lookup: `inferred` from the value's shape, `expected` the assigned widget, else the inferred one. */
  const baseGetTypeInfo = (property: string, value: unknown): PropertyTypeInfo => {
    let inferredType = 'unknown'
    if (typeof value === 'boolean') inferredType = 'checkbox'
    else if (typeof value === 'number') inferredType = 'number'
    else if (typeof value === 'string') inferredType = DATETIME_RE.test(value) ? 'datetime' : DATE_RE.test(value) ? 'date' : 'text'
    else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) inferredType = 'multitext'
    const inferred = manager.getWidget(inferredType)
    const assigned = manager.getAssignedWidget(property)
    return { expected: assigned !== null ? manager.getWidget(assigned) : inferred, inferred }
  }

  const manager = {
    registeredTypeWidgets,
    properties,

    getAllProperties: (): Record<string, PropertyTypeAssignment> => properties,

    getPropertyInfo: (property: string): PropertyTypeAssignment | undefined => {
      const key = property.toLowerCase()
      // Own keys only: a property named `constructor` must not resolve to Object.prototype's.
      return Object.hasOwn(properties, key) ? properties[key] : undefined
    },

    setType: (property: string, type: string): void => {
      properties[property.toLowerCase()] = { name: property, type }
      notify()
    },

    /** Removes an assigned type so the property falls back to inference. */
    unsetType: (property: string): void => {
      delete properties[property.toLowerCase()]
      notify()
    },

    /** Widget for a type name; unknown names resolve to the `unknown` widget, as in Obsidian. */
    getWidget: (type: string): PropertyWidget | undefined =>
      hasWidget(type) ? registeredTypeWidgets[type] : registeredTypeWidgets['unknown'],

    /** The type name assigned to a property (by a plugin, else the vault registry), or null. As in Obsidian this is a string, not a widget. */
    getAssignedWidget: (property: string): string | null => {
      const key = property.toLowerCase()
      const assigned = (Object.hasOwn(properties, key) ? properties[key]?.type : undefined) ?? vaultTypes.get(key)
      return assigned !== undefined && hasWidget(assigned) ? assigned : null
    },

    /**
     * `{ expected, inferred }` widgets for a property and value. `inferred` comes from the value's shape,
     * `expected` is the assigned widget, else the inferred one. Plugins patch this method, so editors must call it.
     */
    getTypeInfo: baseGetTypeInfo,

    /** The plugin whose code supplied this widget, or null for built-in widgets and unknown origins. */
    getWidgetOwner: (candidate: PropertyWidget): string | null => owners.get(candidate) ?? null,

    /** Whether a widget is one of the built-in ones (not replaced or wrapped by a plugin). */
    isBuiltinWidget: (candidate: unknown): boolean => Object.values(builtins).includes(candidate as PropertyWidget),

    /** Mirrors the vault's property-type registry (`key` → `type`), so plugins see the types the user chose. */
    setVaultTypes: (entries: ReadonlyArray<{ key: string; type: string }>): void => {
      const next = new Map(entries.map((entry) => [entry.key.toLowerCase(), toWidgetType(entry.type)]))
      const unchanged = next.size === vaultTypes.size && [...next].every(([key, type]) => vaultTypes.get(key) === type)
      vaultTypes = next
      if (!unchanged) notify()
    },

    /** Calls `listener` after the registered widgets or assigned types changed; returns the unsubscribe function. */
    onChange: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }

  // A plugin patches `getTypeInfo` by assignment. Whatever widget its patch returns is attributed to
  // the plugin that was running when it installed the patch (Nested Properties' object widget).
  let getTypeInfoImpl: (property: string, value: unknown) => PropertyTypeInfo = baseGetTypeInfo
  Object.defineProperty(manager, 'getTypeInfo', {
    enumerable: true,
    configurable: true,
    get: () => getTypeInfoImpl,
    set: (next: (property: string, value: unknown) => PropertyTypeInfo) => {
      const owner = getCurrentPluginId()
      getTypeInfoImpl = owner === null
        ? next
        : (property, value) => {
            const info = next(property, value)
            claim(info.expected, owner)
            claim(info.inferred, owner)
            return info
          }
    },
  })

  return manager
}

/** The manager type plugins and the editor share. */
export type MetadataTypeManager = ReturnType<typeof createMetadataTypeManager>

let shared: MetadataTypeManager | null = null

/** The window-wide manager, created on first use. */
export function getMetadataTypeManager(): MetadataTypeManager {
  shared ??= createMetadataTypeManager()
  return shared
}
