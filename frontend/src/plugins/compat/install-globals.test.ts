/**
 * Regression test: `installObsidianGlobals()` must populate the whole namespace
 * *synchronously*, before it returns.
 *
 * Why this matters:
 * `plugin-loader.ts` hands `window.obsidian` to every evaluated plugin bundle,
 * and `registerFallbackShims()` fills any name still unclaimed with a minimal
 * no-op. Every layer registers with `if (!window.obsidian[x])` guards, so the
 * *first* writer claims a name permanently.
 *
 * Registering the real implementations on a deferred promise (`import().then()`)
 * therefore lost the race whenever a plugin loaded before the promise settled:
 * the cheap fallbacks won and the real implementations were silently discarded —
 * non-deterministically, depending only on microtask timing.
 *
 * The snapshot below is taken at module top level, in the same synchronous turn
 * as the install call — no microtask gap. Anything registered via a deferred
 * import is therefore absent from it.
 */
import { describe, it, expect } from 'vitest'
import { installObsidianGlobals } from './install-globals'
import { withPluginContext } from './plugin-execution-context'

// Captured synchronously, in the same turn as the install call — no microtask gap.
installObsidianGlobals()
const snapshot: Record<string, unknown> = { ...(window.obsidian ?? {}) }

describe('installObsidianGlobals', () => {
  describe('registers shims synchronously on import', () => {
    it.each([
      'SuggestModal',
      'FuzzySuggestModal',
      'MarkdownRenderer',
      'Editor',
    ])('%s is available without awaiting a microtask', (name) => {
      expect(snapshot[name]).toBeTypeOf('function')
    })
  })

  describe('registers obsidian-api-extensions synchronously on import', () => {
    it.each([
      'Events',
      'Scope',
      'Keymap',
      'parseYaml',
      'getAllTags',
      'prepareFuzzySearch',
      'ExtraButtonComponent',
      'MarkdownPreviewRenderer',
    ])('%s is available without awaiting a microtask', (name) => {
      expect(snapshot[name]).toBeDefined()
    })
  })

  describe('registers the real implementations, not the fallback shims', () => {
    it('parseYaml parses YAML, unlike the fallback which is JSON.parse', () => {
      const parseYaml = snapshot['parseYaml'] as (s: string) => unknown

      // The fallback is `JSON.parse` wrapped in try/catch and returns {} for
      // any real YAML frontmatter.
      expect(parseYaml('title: Hello')).toEqual({ title: 'Hello' })
    })

    it('prepareFuzzySearch matches, unlike the fallback which always returns null', () => {
      const prepareFuzzySearch = snapshot['prepareFuzzySearch'] as (
        q: string,
      ) => (text: string) => unknown

      expect(prepareFuzzySearch('abc')('abc')).not.toBeNull()
    })
  })

  describe('window globals plugin bundles read directly', () => {
    it.each([
      'moment',
      'createEl',
      'createDiv',
      'createSpan',
      'createFragment',
      'activeWindow',
      'activeDocument',
      'sleep',
      'nextFrame',
      'CodeMirror',
      'CodeMirrorAdapter',
    ])('installs window.%s', (name) => {
      expect((window as unknown as Record<string, unknown>)[name]).toBeDefined()
    })
  })

  describe('CodeMirrorAdapter.Vim', () => {
    // Regression: obsidian-outliner's "override Vim o/O behaviour" feature
    // (src/features/VimOBehaviourOverride.ts) checks
    // `window.CodeMirrorAdapter.Vim` and logs `console.error("Vim adapter not
    // found")` when it's missing, instead of skipping the optional feature
    // silently. Slatebase has no Vim keymap engine, so this is a no-op stub —
    // same graceful-degradation approach as the other CodeMirrorAdapter/CodeMirror
    // globals above, not a real Vim implementation.
    it.each(['defineAction', 'handleEx', 'enterInsertMode', 'mapCommand'])(
      'exposes a no-op %s so plugins probing for the Vim adapter do not error',
      (method) => {
        const vim = (
          window as unknown as { CodeMirrorAdapter: { Vim: Record<string, unknown> } }
        ).CodeMirrorAdapter.Vim
        expect(vim[method]).toBeTypeOf('function')
        expect(() => (vim[method] as (...args: unknown[]) => unknown)()).not.toThrow()
      },
    )
  })

  describe('setTimeout/setInterval carry plugin-execution-context across the macrotask boundary', () => {
    // Regression: "Editing Toolbar" (and any plugin) builds DOM inside a bare
    // `setTimeout(() => this.buildUI(), ms)` scheduled from onload(). Before this
    // fix, withPluginContext()'s synchronous save/restore had already unwound to
    // null by the time the deferred callback ran, so createEl() tagged nothing
    // and CssInjector's [data-plugin-id] scoping silently failed to match —
    // producing unstyled, always-visible dropdown/flyout DOM.
    it('createEl() inside a setTimeout callback is tagged with the plugin active when it was scheduled', async () => {
      const createEl = (window as unknown as { createEl: (tag: string) => HTMLElement }).createEl
      let el: HTMLElement | undefined

      withPluginContext('editing-toolbar', () => {
        window.setTimeout(() => {
          el = createEl('div')
        }, 0)
      })

      await new Promise((resolve) => window.setTimeout(resolve, 10))

      expect(el?.getAttribute('data-plugin-id')).toBe('editing-toolbar')
    })

    it('createEl() inside a setInterval callback is tagged with the plugin active when it was scheduled', async () => {
      const createEl = (window as unknown as { createEl: (tag: string) => HTMLElement }).createEl
      let el: HTMLElement | undefined
      let intervalId: number | undefined

      withPluginContext('editing-toolbar', () => {
        intervalId = window.setInterval(() => {
          el = createEl('div')
        }, 0)
      })

      await new Promise((resolve) => window.setTimeout(resolve, 10))
      window.clearInterval(intervalId)

      expect(el?.getAttribute('data-plugin-id')).toBe('editing-toolbar')
    })

    it('does not tag elements created by host-app setTimeout callbacks (no plugin context active)', async () => {
      const createEl = (window as unknown as { createEl: (tag: string) => HTMLElement }).createEl
      let el: HTMLElement | undefined

      window.setTimeout(() => {
        el = createEl('div')
      }, 0)

      await new Promise((resolve) => window.setTimeout(resolve, 10))

      expect(el?.hasAttribute('data-plugin-id')).toBe(false)
    })
  })

  describe('window.app.plugins', () => {
    it('keys manifests by plugin id to the manifest, not to the instance', () => {
      // `app.plugins.manifests[id].version` is how plugins read each other's
      // versions. Aliasing this to the instance map made every such read
      // undefined, since an instance carries those fields under `.manifest`.
      const plugins = (window as unknown as {
        app: {
          plugins: {
            manifests: Record<string, { version?: string }>
            registerPlugin(id: string, instance: unknown): void
            unregisterPlugin(id: string): void
          }
        }
      }).app.plugins

      plugins.registerPlugin('some-plugin', {
        manifest: { id: 'some-plugin', name: 'Some Plugin', version: '2.26.4' },
      })

      expect(plugins.manifests['some-plugin']?.version).toBe('2.26.4')

      plugins.unregisterPlugin('some-plugin')
      expect(plugins.manifests['some-plugin']).toBeUndefined()
    })
  })

  describe('Plugin base class', () => {
    it('stores the manifest passed to the constructor', () => {
      const PluginClass = (window.obsidian as Record<string, unknown>)['Plugin'] as
        new (app: unknown, manifest: unknown) => { manifest: unknown }
      const manifest = { id: 'p', name: 'P', version: '1.2.3' }

      expect(new PluginClass({}, manifest).manifest).toBe(manifest)
    })

    it('preserves plugin loadData overrides while super loads persisted data', async () => {
      const PluginClass = (window.obsidian as Record<string, unknown>)['Plugin'] as
        new (app: unknown, manifest: unknown) => { __slatebaseLoadData?: () => Promise<unknown> }

      class PluginWithDefaults extends PluginClass {
        data: unknown

        async loadData(): Promise<void> {
          this.data = await super.loadData()
        }
      }

      const plugin = new PluginWithDefaults({}, {})
      plugin.__slatebaseLoadData = async () => ({ recentFiles: [] })
      await plugin.loadData()

      expect(plugin.data).toEqual({ recentFiles: [] })
    })
  })

  describe('idempotency', () => {
    it('a repeated call does not replace already-registered implementations', () => {
      const before = window.obsidian as Record<string, unknown>
      const parseYaml = before['parseYaml']
      const Plugin = before['Plugin']

      installObsidianGlobals()

      expect(before['parseYaml']).toBe(parseYaml)
      expect(before['Plugin']).toBe(Plugin)
    })
  })

  describe('HTMLElement.onClickEvent', () => {
    // Regression: plugins that build UI purely with Obsidian's DOM extension
    // methods (e.g. Advanced Tables' sidebar toolbar view) call this directly
    // instead of addEventListener. Without it, the click wiring throws
    // mid-render and the view is left empty — whatever was appended before
    // the throw never reaches contentEl.
    it('registers a click listener and returns the element for chaining', () => {
      const el = document.createElement('div')
      let clicked = false

      const returned = (el as unknown as { onClickEvent: (cb: () => void) => HTMLElement })
        .onClickEvent(() => { clicked = true })

      expect(returned).toBe(el)
      el.dispatchEvent(new MouseEvent('click'))
      expect(clicked).toBe(true)
    })
  })
})
