/**
 * A plugin's children must load when they are added — during onload() and afterwards. PluginLoader runs onload()
 * directly instead of Component.load(), so it has to mark the plugin as loaded itself; before that fix `addChild`
 * silently skipped loading, and Style Settings (which builds its settings page from `plugin.addChild(...)`) showed an
 * empty page.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installObsidianGlobals } from './install-globals'
import { PluginLoader } from './plugin-loader'
import type { PluginLoaderDeps } from './plugin-loader'
import type { PluginManifest } from './manifest-parser'
import type { IAppShim, IPluginSandbox } from './types'

type ComponentLike = { load(): void; unload(): void; onload(): void; addChild<T>(child: T): T }

const manifest: PluginManifest = {
  id: 'child-plugin', name: 'Child Plugin', version: '1.0.0', minAppVersion: '0.15.0', description: '', author: 'test', isDesktopOnly: false,
}

function createLoader(bundleEvaluator: PluginLoaderDeps['bundleEvaluator']): PluginLoader {
  const sandbox: IPluginSandbox = { createContext: vi.fn(), startMonitoring: vi.fn(), stopMonitoring: vi.fn(), cleanup: vi.fn() }
  return new PluginLoader({
    appShimFactory: () => ({ vault: {}, workspace: {}, metadataCache: {}, plugins: { plugins: {}, enabledPlugins: new Set(), getPlugin: () => undefined } }) as unknown as IAppShim,
    sandbox,
    onStatusChange: vi.fn(),
    bundleEvaluator,
  })
}

// loadPlugin() warms the whole built-in icon cache first, which takes seconds on a loaded machine.
describe('PluginLoader marks the plugin as loaded before onload()', { timeout: 30_000 }, () => {
  beforeEach(() => {
    installObsidianGlobals()
  })

  /** A child component that records its lifecycle. */
  function createChild() {
    const Component = (window as unknown as { obsidian: { Component: new () => ComponentLike } }).obsidian.Component
    const events: string[] = []
    class Child extends Component {
      override onload(): void { events.push('load') }
      onunload(): void { events.push('unload') }
    }
    return { child: new Child(), events }
  }

  it('loads a child added during onload()', async () => {
    const { child, events } = createChild()
    const Plugin = (window as unknown as { obsidian: { Plugin: new (app: unknown, manifest: unknown) => ComponentLike } }).obsidian.Plugin
    const loader = createLoader(async () => ({
      default: class extends Plugin {
        override onload(): void { this.addChild(child) }
      },
    }))

    await loader.loadPlugin('child-plugin', 'bundle', manifest)
    await loader.activatePlugin('child-plugin')

    expect(events).toEqual(['load'])
  })

  it('loads a child added after onload() has returned (the Style Settings case: a settings tab built on demand)', async () => {
    const { child, events } = createChild()
    const Plugin = (window as unknown as { obsidian: { Plugin: new (app: unknown, manifest: unknown) => ComponentLike } }).obsidian.Plugin
    let instance: ComponentLike | undefined
    const loader = createLoader(async () => ({
      default: class extends Plugin {
        constructor(app: unknown, m: unknown) {
          super(app, m)
          instance = this
        }
      },
    }))

    await loader.loadPlugin('child-plugin', 'bundle', manifest)
    await loader.activatePlugin('child-plugin')
    expect(events).toEqual([])

    instance?.addChild(child)

    expect(events).toEqual(['load'])
  })

  it('unloads the children when the plugin is deactivated', async () => {
    const { child, events } = createChild()
    const Plugin = (window as unknown as { obsidian: { Plugin: new (app: unknown, manifest: unknown) => ComponentLike } }).obsidian.Plugin
    const loader = createLoader(async () => ({
      default: class extends Plugin {
        override onload(): void { this.addChild(child) }
      },
    }))
    await loader.loadPlugin('child-plugin', 'bundle', manifest)
    await loader.activatePlugin('child-plugin')

    await loader.deactivatePlugin('child-plugin')

    expect(events).toEqual(['load', 'unload'])
  })

  it('keeps working for a plugin class without markLoaded (a bundle that brings its own base class)', async () => {
    const onload = vi.fn()
    const loader = createLoader(async () => ({
      default: class {
        manifest = manifest
        onload() { onload() }
        onunload() {}
        loadData() { return Promise.resolve(null) }
        saveData() { return Promise.resolve() }
        addCommand() {}
        registerEvent() {}
      },
    }))

    await loader.loadPlugin('child-plugin', 'bundle', manifest)
    await loader.activatePlugin('child-plugin')

    expect(onload).toHaveBeenCalledTimes(1)
  })
})
