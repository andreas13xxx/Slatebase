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
 * SettingTabRegistry — Simple Map-based registry for plugin setting tabs.
 */
export class SettingTabRegistry implements ISettingTabRegistry {
  private readonly tabs: Map<string, PluginSettingTab> = new Map()

  register(pluginId: string, tab: PluginSettingTab): void {
    this.tabs.set(pluginId, tab)
  }

  remove(pluginId: string): void {
    this.tabs.delete(pluginId)
  }

  get(pluginId: string): PluginSettingTab | undefined {
    return this.tabs.get(pluginId)
  }

  has(pluginId: string): boolean {
    return this.tabs.has(pluginId)
  }

  clear(): void {
    this.tabs.clear()
  }
}
