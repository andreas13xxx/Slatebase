/**
 * Module-level bridge between the settings search results (nav list) and the section content: a click on
 * a hit asks the content to scroll to and highlight the text it matched. A bridge rather than reducer
 * state because it is a one-shot UI request, not something to persist or restore.
 */
import type { SettingsSection } from './settingsState'

/** A pending request to reveal a text inside a section. `id` changes with every request. */
export interface SettingsSearchTarget {
  id: number
  section: SettingsSection
  text: string
}

let current: SettingsSearchTarget | null = null
let counter = 0
const listeners = new Set<() => void>()

/** Asks the settings content to scroll to and highlight `text` in `section`. */
export function requestSettingsReveal(section: SettingsSection, text: string): void {
  counter += 1
  current = { id: counter, section, text }
  listeners.forEach((l) => { l() })
}

/** Subscribes to new requests (for `useSyncExternalStore`). */
export function subscribeSettingsReveal(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The latest request, or null. */
export function getSettingsRevealRequest(): SettingsSearchTarget | null {
  return current
}
