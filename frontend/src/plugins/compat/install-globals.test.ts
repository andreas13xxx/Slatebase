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
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { installObsidianGlobals } from './install-globals'
import { withPluginContext } from './plugin-execution-context'
import { WorkspaceLeaf, WorkspaceSplit, WorkspaceRibbon } from './view-registry'

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

  describe('WorkspaceLeaf/WorkspaceSplit/WorkspaceRibbon are the real classes, not disconnected stubs', () => {
    // Regression: window.obsidian.WorkspaceLeaf used to be a standalone stub
    // class unrelated to the real WorkspaceLeaf that flows through the app
    // (workspace.activeLeaf, getLeaf(), etc. — see view-registry.ts), so any
    // plugin doing `activeLeaf instanceof WorkspaceLeaf` always got `false`.
    it('registers the real WorkspaceLeaf class from view-registry.ts', () => {
      expect(snapshot['WorkspaceLeaf']).toBe(WorkspaceLeaf)
    })

    it('registers the real WorkspaceSplit/WorkspaceRibbon classes from view-registry.ts', () => {
      expect(snapshot['WorkspaceSplit']).toBe(WorkspaceSplit)
      expect(snapshot['WorkspaceRibbon']).toBe(WorkspaceRibbon)
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

  describe('document.createElement() carries plugin-execution-context, tagging raw DOM API calls like createEl() does', () => {
    // Regression: obsidian-outliner's vertical-lines overlay is built via a
    // bare `document.createElement("div")`, not createEl() — plugins are
    // ordinary JS and commonly reach for the native DOM API directly. Before
    // this fix, such elements came back untagged, so CssInjector's
    // [data-plugin-id] scoping (both the self and ancestor forms) silently
    // failed to match anything they built.
    it('tags an element created via document.createElement() while a plugin is active', () => {
      let el: HTMLElement | undefined
      withPluginContext('obsidian-outliner', () => {
        el = document.createElement('div')
      })
      expect(el?.getAttribute('data-plugin-id')).toBe('obsidian-outliner')
    })

    it('does not tag elements created outside any plugin context (the host app\'s own DOM creation)', () => {
      const el = document.createElement('div')
      expect(el.hasAttribute('data-plugin-id')).toBe(false)
    })
  })

  describe('ViewPlugin.define()/fromClass() carry plugin-execution-context into CM6-driven calls', () => {
    // Regression: a CM6 ViewPlugin's constructor and update()/destroy() are
    // invoked by CodeMirror's own internal reconciliation, on its own
    // schedule — not synchronously under registerEditorExtension()'s call
    // frame, the same macrotask-boundary shape as setTimeout above, just via
    // CM6's scheduler instead of a browser API. obsidian-outliner's
    // vertical-lines overlay is built this way; before this fix, its
    // document.createElement() calls came back untagged, the overlay fell
    // back to `position: static` in the editor's flex layout, and squeezed
    // CodeMirror's own `.cm-scroller` down to almost nothing.
    function getViewPlugin() {
      return (window as unknown as { __codemirrorView: { ViewPlugin: typeof import('@codemirror/view').ViewPlugin } })
        .__codemirrorView.ViewPlugin
    }

    it('the create() factory runs with the plugin active when ViewPlugin.define() was called', () => {
      const ViewPlugin = getViewPlugin()
      let built: HTMLElement | undefined

      const plugin = withPluginContext('obsidian-outliner', () =>
        ViewPlugin.define(() => {
          built = document.createElement('div')
          return {}
        })
      )

      const parent = document.createElement('div')
      const view = new EditorView({ parent, state: EditorState.create({ extensions: [plugin] }) })

      expect(built?.getAttribute('data-plugin-id')).toBe('obsidian-outliner')
      view.destroy()
    })

    it('update() and destroy() also run tagged, even though CM6 calls them with no plugin context of its own', () => {
      const ViewPlugin = getViewPlugin()
      const built: HTMLElement[] = []

      const plugin = withPluginContext('obsidian-outliner', () =>
        ViewPlugin.define(() => ({
          update() { built.push(document.createElement('span')) },
          destroy() { built.push(document.createElement('i')) },
        }))
      )

      const parent = document.createElement('div')
      const view = new EditorView({ parent, state: EditorState.create({ doc: 'a', extensions: [plugin] }) })
      view.dispatch({ changes: { from: 0, insert: 'b' } })
      view.destroy()

      expect(built.length).toBeGreaterThan(0)
      expect(built.every((el) => el.getAttribute('data-plugin-id') === 'obsidian-outliner')).toBe(true)
    })

    it('does not tag a plugin value built outside any plugin context (Slatebase\'s own ViewPlugin.define() calls)', () => {
      const ViewPlugin = getViewPlugin()
      let built: HTMLElement | undefined

      const plugin = ViewPlugin.define(() => {
        built = document.createElement('div')
        return {}
      })

      const parent = document.createElement('div')
      const view = new EditorView({ parent, state: EditorState.create({ extensions: [plugin] }) })

      expect(built?.hasAttribute('data-plugin-id')).toBe(false)
      view.destroy()
    })
  })

  describe('Component.registerDomEvent carries plugin-execution-context into the handler', () => {
    // Regression: registerDomEvent() added the listener directly, so it ran
    // with no current plugin id. A handler that itself schedules a
    // setTimeout (e.g. Excalidraw's forceSave -> resetAutosaveTimer, run from
    // a registered blur/visibilitychange listener) therefore scheduled that
    // timer untagged: trackPluginTimer() never recorded it, so
    // sandbox.cleanup() couldn't cancel it on unload — it fired later against
    // a torn-down plugin and threw `this.plugin is undefined`.
    it('createEl() inside the DOM event handler is tagged with the plugin that registered it', () => {
      const createEl = (window as unknown as { createEl: (tag: string) => HTMLElement }).createEl
      const ComponentClass = (window.obsidian as unknown as { Component: new () => {
        registerDomEvent(el: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void
      } }).Component
      const target = document.createElement('div')
      let el: HTMLElement | undefined

      withPluginContext('excalidraw', () => {
        const component = new ComponentClass()
        component.registerDomEvent(target, 'click', () => {
          el = createEl('div')
        })
      })
      target.dispatchEvent(new Event('click'))

      expect(el?.getAttribute('data-plugin-id')).toBe('excalidraw')
    })

    it('a setTimeout scheduled from inside the handler is still tagged, so it survives an async hop', async () => {
      const createEl = (window as unknown as { createEl: (tag: string) => HTMLElement }).createEl
      const ComponentClass = (window.obsidian as unknown as { Component: new () => {
        registerDomEvent(el: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void
      } }).Component
      const target = document.createElement('div')
      let el: HTMLElement | undefined

      withPluginContext('excalidraw', () => {
        const component = new ComponentClass()
        component.registerDomEvent(target, 'click', () => {
          window.setTimeout(() => {
            el = createEl('div')
          }, 0)
        })
      })
      target.dispatchEvent(new Event('click'))

      await new Promise((resolve) => window.setTimeout(resolve, 10))

      expect(el?.getAttribute('data-plugin-id')).toBe('excalidraw')
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

  describe('UIEvent.win/doc', () => {
    // Regression: Kanban's list-focus handler reads `evt.win.setTimeout(...)`
    // on the FocusEvent it receives when a new list is created. Obsidian
    // patches `win`/`doc` onto UIEvent (not just Element), so without this
    // patch `evt.win` is undefined and the handler throws "can't access
    // property 'setTimeout', <evt>.win is undefined".
    it('evt.win resolves to the event target\'s owner window', () => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      let seenWin: unknown
      el.addEventListener('focus', (evt) => { seenWin = (evt as unknown as { win?: Window }).win })
      el.dispatchEvent(new FocusEvent('focus'))
      expect(seenWin).toBe(window)
      el.remove()
    })

    it('evt.doc resolves to the event target\'s owner document', () => {
      const el = document.createElement('div')
      document.body.appendChild(el)
      let seenDoc: unknown
      el.addEventListener('click', (evt) => { seenDoc = (evt as unknown as { doc?: Document }).doc })
      el.dispatchEvent(new MouseEvent('click'))
      expect(seenDoc).toBe(document)
      el.remove()
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
