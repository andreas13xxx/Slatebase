/**
 * SettingTabRegistry — Tracks which plugins have registered a PluginSettingTab.
 *
 * When a plugin calls `this.addSettingTab(tab)` in its `onload()`, the tab is
 * registered here. The Plugin Management UI can then render the native settings UI
 * by calling `tab.display()` and mounting `tab.containerEl`.
 *
 * @module setting-tab-registry
 */

import type { PluginSettingTab } from './setting-tab'

/**
 * ISettingTabRegistry — Interface for the setting tab registry.
 */
export interface ISettingTabRegistry {
  /** Register a setting tab for a plugin. */
  register(pluginId: string, tab: PluginSettingTab): void
  /** Remove the setting tab for a plugin. */
  remove(pluginId: string): void
  /** Get the setting tab for a plugin (or undefined if none registered). */
  get(pluginId: string): PluginSettingTab | undefined
  /** Check if a plugin has a registered setting tab. */
  has(pluginId: string): boolean
  /** Remove all registered setting tabs. */
  clear(): void
}

/**
 * Obsidian's `app.setting.pluginTabs`: the tabs of all loaded plugins, which plugins `find()` in.
 * One array for every `AppShim` (each plugin has its own shim, but Obsidian has one app), mutated
 * in place by `SettingTabRegistry` so a reference a shim holds never goes stale.
 */
export const pluginSettingTabs: unknown[] = []

function dropPluginSettingTab(tab: unknown): void {
  const index = pluginSettingTabs.indexOf(tab)
  if (index !== -1) pluginSettingTabs.splice(index, 1)
}

/**
 * SettingTabRegistry — Simple Map-based registry for plugin setting tabs.
 * Keeps the shared `pluginSettingTabs` array in step with its own entries.
 */
export class SettingTabRegistry implements ISettingTabRegistry {
  private readonly tabs: Map<string, PluginSettingTab> = new Map()

  register(pluginId: string, tab: PluginSettingTab): void {
    dropPluginSettingTab(this.tabs.get(pluginId))
    this.tabs.set(pluginId, tab)
    pluginSettingTabs.push(tab)
  }

  remove(pluginId: string): void {
    dropPluginSettingTab(this.tabs.get(pluginId))
    this.tabs.delete(pluginId)
  }

  get(pluginId: string): PluginSettingTab | undefined {
    return this.tabs.get(pluginId)
  }

  has(pluginId: string): boolean {
    return this.tabs.has(pluginId)
  }

  clear(): void {
    for (const tab of this.tabs.values()) dropPluginSettingTab(tab)
    this.tabs.clear()
  }
}
