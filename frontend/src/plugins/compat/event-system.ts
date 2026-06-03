import type { EventRef, IEventEmitter } from './types';

/** Internal listener entry stored per event */
interface ListenerEntry {
  id: string;
  callback: (...args: unknown[]) => void;
}

let nextId = 0;

/** Generate a unique ID for each EventRef */
function generateId(): string {
  return `evt_${(nextId++).toString(36)}_${Date.now().toString(36)}`;
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
  on(event: string, callback: (...args: unknown[]) => void): EventRef {
    const id = generateId();
    const entry: ListenerEntry = { id, callback };

    const list = this.listeners.get(event);
    if (list) {
      list.push(entry);
    } else {
      this.listeners.set(event, [entry]);
    }

    return { id, event, callback };
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
        entry.callback(...args);
      } catch (err) {
        console.error(
          `[PluginEventSystem] Exception in event callback for "${event}":`,
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
