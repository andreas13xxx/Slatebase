import type { EventRef, IEventEmitter } from './types';
import { getCurrentPluginId, withPluginContext } from './plugin-execution-context';
import { errorOnce } from './log';

/** Internal listener entry stored per event */
interface ListenerEntry {
  id: string;
  callback: (...args: unknown[]) => void;
  /** Optional receiver supplied through Obsidian's `on(event, callback, context)` API. */
  context: unknown;
  /** The plugin executing when this listener was registered, if any. */
  pluginId: string | null;
}

let nextId = 0;

/** Generate a unique ID for each EventRef */
function generateId(): string {
  return `evt_${(nextId++).toString(36)}_${Date.now().toString(36)}`;
}

/**
 * Which emitter produced each EventRef.
 *
 * `Component.registerEvent(ref)` promises to deregister the listener on unload,
 * but an EventRef alone does not say where it came from — and every shim
 * (Vault, Workspace, MetadataCache) hands out refs from its own EventSystem.
 * A WeakMap keeps the association without putting an internal field on the ref
 * object, which plugins can see and Obsidian's own EventRef does not have.
 */
const owners = new WeakMap<EventRef, EventSystem>();

/**
 * Deregister an EventRef at whichever emitter produced it.
 *
 * @returns `false` if the ref did not come from an EventSystem, so callers can
 *          fall back or report the gap instead of silently doing nothing.
 */
export function offrefAtOwner(ref: EventRef): boolean {
  const owner = owners.get(ref);
  if (!owner) return false;
  owner.offref(ref);
  return true;
}

/** Whether this ref came from an EventSystem and can therefore be deregistered. */
export function isOwnedEventRef(ref: unknown): ref is EventRef {
  return typeof ref === 'object' && ref !== null && owners.has(ref as EventRef);
}

/**
 * EventSystem — Obsidian-compatible event emitter.
 *
 * - Synchronous dispatch in registration order
 * - Exception isolation per callback (errors are logged, remaining callbacks still fire)
 * - Idempotent off() (no-throw on unregistered/already-removed callbacks)
 * - offref() removes by EventRef
 * - removeAllListeners() clears all registrations
 */
export class EventSystem implements IEventEmitter {
  private listeners: Map<string, ListenerEntry[]> = new Map();

  /**
   * Register a callback for the given event.
   * Returns an EventRef that can be used with offref() to deregister.
   */
  on(event: string, callback: (...args: unknown[]) => void, context?: unknown): EventRef {
    const id = generateId();
    const entry: ListenerEntry = { id, callback, context, pluginId: getCurrentPluginId() };

    const list = this.listeners.get(event);
    if (list) {
      list.push(entry);
    } else {
      this.listeners.set(event, [entry]);
    }

    const ref: EventRef = { id, event, callback };
    owners.set(ref, this);
    return ref;
  }

  /**
   * Remove a specific callback from the given event.
   * Idempotent — does not throw if the callback is not registered or was already removed.
   */
  off(event: string, callback: (...args: unknown[]) => void): void {
    const list = this.listeners.get(event);
    if (!list) return;

    const idx = list.findIndex(entry => entry.callback === callback);
    if (idx === -1) return;

    list.splice(idx, 1);

    if (list.length === 0) {
      this.listeners.delete(event);
    }
  }

  /**
   * Trigger an event, calling all registered callbacks synchronously in registration order.
   * Each callback is wrapped in try/catch — if one throws, the error is logged and
   * remaining callbacks still execute.
   */
  trigger(event: string, ...args: unknown[]): void {
    const list = this.listeners.get(event);
    if (!list || list.length === 0) return;

    // Iterate a snapshot so that off() calls during trigger don't affect this dispatch
    const snapshot = [...list];

    for (const entry of snapshot) {
      // Check the listener is still registered (may have been removed during this trigger)
      if (!this.isRegistered(event, entry.id)) continue;

      try {
        withPluginContext(entry.pluginId, () => entry.callback.apply(entry.context, args));
      } catch (err) {
        errorOnce(
          `PluginEventSystem.callbackError::${event}::${entry.pluginId}`,
          `[PluginEventSystem] Exception in event callback for "${event}" (plugin "${entry.pluginId}"):`,
          err
        );
      }
    }
  }

  /**
   * Remove a listener by its EventRef.
   * Idempotent — does not throw if already removed.
   */
  offref(ref: EventRef): void {
    const list = this.listeners.get(ref.event);
    if (!list) return;

    const idx = list.findIndex(entry => entry.id === ref.id);
    if (idx === -1) return;

    list.splice(idx, 1);

    if (list.length === 0) {
      this.listeners.delete(ref.event);
    }
  }

  /**
   * Remove all listeners for all events.
   */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /** Check if a listener with the given id is still registered for the event */
  private isRegistered(event: string, id: string): boolean {
    const list = this.listeners.get(event);
    if (!list) return false;
    return list.some(entry => entry.id === id);
  }
}
