/**
 * Installs the Obsidian-compatible global namespace (`window.obsidian`) plus the
 * DOM and window globals that plugin bundles expect to already exist.
 *
 * This is the bulk of the compatibility layer. It used to live at the bottom of
 * `setting-tab.ts` as ~1800 lines of top-level side effects that ran on import,
 * which made the ordering implicit, the surface untestable and the file's name a
 * lie. It is now an explicit, idempotent function that entry points call.
 *
 * Registration order matters and is deliberate:
 *   1. DOM prototype patches and globals — plugin bundles use them at eval time
 *   2. The real Obsidian API implementations
 *   3. `registerObsidianApiExtensions()` — further real implementations
 *   4. `registerFallbackShims()` — minimal no-ops for anything still unclaimed
 *
 * Every assignment is guarded, so the first writer of a name wins.
 *
 * @module install-globals
 */

import { getStoredAuthToken, getStoredCsrfToken } from '../../state/authContext'
import { addRibbonIcon as registerRibbonIcon } from './ribbon-icon-registry'
import { addStatusBarItem as registerStatusBarItem } from './status-bar-registry'
import moment from 'moment/min/moment-with-locales'

// Real CM6 modules — used to provide functional extensions to plugins
import * as CmState from '@codemirror/state'
import * as CmView from '@codemirror/view'
import * as CmLanguage from '@codemirror/language'
import * as CmCommands from '@codemirror/commands'
import * as CmAutocomplete from '@codemirror/autocomplete'
import * as CmSearch from '@codemirror/search'
import * as CmLint from '@codemirror/lint'
import * as LezerHighlight from '@lezer/highlight'
import * as LezerCommon from '@lezer/common'
import * as LezerLr from '@lezer/lr'

// Obsidian-compatible editor StateFields — plugins access these via require('obsidian')
import {
  editorInfoField,
  editorEditorField,
  editorLivePreviewField,
  editorViewField,
} from '../../editor/editor-state-fields'

// NodeProp for tokenClassNodeProp polyfill (removed from @codemirror/language in v6.x)
import { tokenClassNodeProp } from '../../editor/token-class-node-prop'

// Load Obsidian-compatible CSS variables (maps Slatebase tokens to Obsidian naming)
import './obsidian-compat.css'

// Load global prototype extensions (Array, String, Math, Object, Element, Node)
// Must be before any plugin code evaluates — plugins use these directly.
import './global-extensions'

// Settings UI classes registered onto the namespace below.
import {
  PluginSettingTab,
  Setting,
  TextComponent,
  TextAreaComponent,
  ToggleComponent,
  DropdownComponent,
  ButtonComponent,
  SliderComponent,
} from './setting-tab'

// Shims registered on window.obsidian below. These MUST be static imports:
// plugin-loader.ts hands the namespace to every evaluated bundle, and every
// layer guards with `if (!window.obsidian[x])` (first writer wins, permanently).
// A deferred registration would let a plugin observe an incomplete namespace.
import { SuggestModal, FuzzySuggestModal } from './suggest-modal'
import { MarkdownRenderer } from './markdown-renderer'
import { EditorShim } from './editor-shim'
import { registerObsidianApiExtensions } from './obsidian-api-extensions'
import { registerFallbackShims } from './fallback-shims'
import { detectPlatform, readPlatformEnvironment } from './platform-detection'
import { installApiGapInspector } from './api-gap-registry'
import { warnNoOp } from './no-op-warning'
// Aliased: the Plugin methods below carry the same names and would read as
// recursive calls otherwise.
import {
  registerHoverLinkSource as addHoverSource,
  unregisterHoverLinkSource as removeHoverSource,
} from './hover-link-bus'

// ─── Obsidian-compatible syntaxTree wrapper ──────────────────────────────────────

/**
 * Creates a wrapped version of `syntaxTree()` that adjusts InlineCode node ranges
 * to exclude backtick delimiters, matching Obsidian's parser behavior.
 *
 * In @codemirror/lang-markdown, the `InlineCode` node includes the backticks:
 *   InlineCode: from=6, to=24 → "`= this.file.name`"
 *
 * In Obsidian's internal parser, InlineCode covers only the content:
 *   InlineCode: from=7, to=23 → "= this.file.name"
 *
 * Plugins like Dataview use `node.from`/`node.to` to slice the document and check
 * `startsWith("=")` for inline queries. Without this adjustment, the sliced text
 * starts with a backtick and inline queries are never recognized.
 *
 * The wrapper intercepts `tree.iterate()` and `tree.cursor()` to provide adjusted
 * node boundaries when visiting InlineCode nodes with CodeMark children.
 */
function createObsidianCompatSyntaxTree(
  originalSyntaxTree: typeof CmLanguage.syntaxTree
): typeof CmLanguage.syntaxTree {
  return function obsidianCompatSyntaxTree(
    state: Parameters<typeof CmLanguage.syntaxTree>[0]
  ) {
    const tree = originalSyntaxTree(state)

    // Return a proxy that intercepts iterate() to adjust InlineCode ranges
    return new Proxy(tree, {
      get(target, prop, receiver) {
        if (prop === 'iterate') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return function iterate(spec: any) {
            const originalEnter = spec.enter
            if (!originalEnter) {
              return target.iterate(spec)
            }

            return target.iterate({
              ...spec,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              enter(cursor: any) {
                // Adjust InlineCode node: strip backtick delimiters from range
                const name = cursor.name as string | undefined
                if (name === 'InlineCode') {
                  const node = cursor.node
                  if (node) {
                    const origFrom = node.from as number
                    const origTo = node.to as number
                    // Verify node has CodeMark children (backtick delimiters)
                    const firstChild = node.firstChild
                    const lastChild = node.lastChild
                    if (
                      firstChild && firstChild.name === 'CodeMark' &&
                      lastChild && lastChild.name === 'CodeMark' &&
                      firstChild.to != null && lastChild.from != null
                    ) {
                      // Override node.from/to to exclude backtick markers
                      Object.defineProperty(node, 'from', { value: firstChild.to, writable: true, configurable: true })
                      Object.defineProperty(node, 'to', { value: lastChild.from, writable: true, configurable: true })
                      // Also adjust the cursor itself (some plugins read cursor.from/to)
                      const cursorFromDesc = Object.getOwnPropertyDescriptor(cursor, 'from')
                      const cursorToDesc = Object.getOwnPropertyDescriptor(cursor, 'to')
                      if (cursorFromDesc && cursorFromDesc.writable) {
                        cursor.from = firstChild.to
                      }
                      if (cursorToDesc && cursorToDesc.writable) {
                        cursor.to = lastChild.from
                      }
                      try {
                        return originalEnter(cursor)
                      } finally {
                        // Restore original values so tree navigation isn't corrupted
                        const proto = Object.getPrototypeOf(node)
                        const fromGetter = Object.getOwnPropertyDescriptor(proto, 'from')
                        const toGetter = Object.getOwnPropertyDescriptor(proto, 'to')
                        if (fromGetter?.get) {
                          Object.defineProperty(node, 'from', { get: fromGetter.get, configurable: true })
                        }
                        if (toGetter?.get) {
                          Object.defineProperty(node, 'to', { get: toGetter.get, configurable: true })
                        }
                        if (cursorFromDesc && cursorFromDesc.writable) {
                          cursor.from = origFrom
                        }
                        if (cursorToDesc && cursorToDesc.writable) {
                          cursor.to = origTo
                        }
                      }
                    }
                  }
                }
                return originalEnter(cursor)
              },
            })
          }
        }
        return Reflect.get(target, prop, receiver)
      },
    })
  } as typeof CmLanguage.syntaxTree
}

// ─── Global Registration ───────────────────────────────────────────────────────

/**
 * Register PluginSettingTab and Setting on the global 'obsidian' module shim.
 * Obsidian plugins access these via `const { PluginSettingTab, Setting } = require('obsidian')`.
 * The global 'obsidian' object is also used by the bundle evaluation when plugins
 * reference the external 'obsidian' module.
 */
declare global {
  interface Window {
    obsidian?: Record<string, unknown>
  }
}


/** Guard so repeated calls from multiple entry points are harmless. */
let installed = false

/**
 * Install the Obsidian-compatible globals. Idempotent.
 */
export function installObsidianGlobals(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  if (!window.obsidian) {
    window.obsidian = {}
  }

  // ─── DOM Prototype Extensions (synchronous, required before any plugin loads) ──
  // Obsidian patches DOM prototypes with utility methods that plugins use directly.
  // These MUST be registered synchronously before plugin bundles evaluate.
  if (!('addClass' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'addClass', {
      value: function (this: Element, ...classes: string[]): void { this.classList.add(...classes) },
      writable: true, configurable: true,
    })
  }
  if (!('addClasses' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'addClasses', {
      value: function (this: Element, classes: string[]): void { this.classList.add(...classes) },
      writable: true, configurable: true,
    })
  }
  if (!('removeClass' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'removeClass', {
      value: function (this: Element, ...classes: string[]): void { this.classList.remove(...classes) },
      writable: true, configurable: true,
    })
  }
  if (!('toggleClass' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'toggleClass', {
      value: function (this: Element, classes: string | string[], value: boolean): void {
        const list = Array.isArray(classes) ? classes : [classes]
        for (const cls of list) this.classList.toggle(cls, value)
      },
      writable: true, configurable: true,
    })
  }
  if (!('hasClass' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'hasClass', {
      value: function (this: Element, cls: string): boolean { return this.classList.contains(cls) },
      writable: true, configurable: true,
    })
  }
  // Obsidian exposes `element.doc` as a getter returning the ownerDocument.
  // Plugins (e.g. LiveSync) use `containerEl.doc.createEl(...)` to create elements.
  if (!('doc' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'doc', {
      get: function (this: Element): Document { return this.ownerDocument },
      configurable: true,
    })
  }
  // Also expose `win` getter (ownerDocument.defaultView) used by some plugins.
  if (!('win' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'win', {
      get: function (this: Element): Window { return this.ownerDocument.defaultView ?? window },
      configurable: true,
    })
  }
  if (!('appendText' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'appendText', {
      value: function (this: Node, val: string): void {
        // Guard: Document nodes cannot have Text children — append to documentElement instead
        if (this.nodeType === 9) {
          (this as Document).documentElement.appendChild(document.createTextNode(val))
        } else {
          this.appendChild(document.createTextNode(val))
        }
      },
      writable: true, configurable: true,
    })
  }
  if (!('detach' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'detach', {
      value: function (this: Node): void { this.parentNode?.removeChild(this) },
      writable: true, configurable: true,
    })
  }
  if (!('empty' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'empty', {
      value: function (this: Node): void { while (this.firstChild) this.removeChild(this.firstChild) },
      writable: true, configurable: true,
    })
  }
  if (!('show' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'show', {
      value: function (this: HTMLElement): void { this.style.display = '' },
      writable: true, configurable: true,
    })
  }
  if (!('hide' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'hide', {
      value: function (this: HTMLElement): void { this.style.display = 'none' },
      writable: true, configurable: true,
    })
  }
  if (!('setText' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'setText', {
      value: function (this: Element, val: string): void { this.textContent = val },
      writable: true, configurable: true,
    })
  }
  if (!('getText' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'getText', {
      value: function (this: Element): string { return this.textContent ?? '' },
      writable: true, configurable: true,
    })
  }

  // Global createEl / createDiv / createSpan
  if (!(window as unknown as { createEl?: unknown }).createEl) {
    (window as unknown as { createEl: unknown }).createEl = function(tag: string, o?: unknown): HTMLElement {
      const el = document.createElement(tag)
      if (typeof o === 'string') { el.className = o }
      else if (o && typeof o === 'object') {
        const opts = o as { cls?: string | string[]; text?: string; attr?: Record<string, string | number | boolean | null>; parent?: Node }
        if (opts.cls) { if (Array.isArray(opts.cls)) el.className = opts.cls.join(' '); else el.className = opts.cls }
        if (opts.text) el.textContent = opts.text
        if (opts.attr) { for (const [k, v] of Object.entries(opts.attr)) { if (v !== null) el.setAttribute(k, String(v)) } }
        if (opts.parent) opts.parent.appendChild(el)
      }
      return el
    }
  }
  if (!(window as unknown as { createDiv?: unknown }).createDiv) {
    (window as unknown as { createDiv: unknown }).createDiv = function(o?: unknown): HTMLDivElement {
      return (window as unknown as { createEl: (tag: string, o?: unknown) => HTMLElement }).createEl('div', o) as HTMLDivElement
    }
  }
  if (!(window as unknown as { createSpan?: unknown }).createSpan) {
    (window as unknown as { createSpan: unknown }).createSpan = function(o?: unknown): HTMLSpanElement {
      return (window as unknown as { createEl: (tag: string, o?: unknown) => HTMLElement }).createEl('span', o) as HTMLSpanElement
    }
  }
  if (!('createEl' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'createEl', {
      value: function (this: Node, tag: string, o?: unknown): HTMLElement {
        const el = (window as unknown as { createEl: (tag: string, o?: unknown) => HTMLElement }).createEl(tag, o)
        // Guard: Document nodes cannot accept additional Element children via appendChild
        if (this.nodeType !== 9) {
          this.appendChild(el)
        }
        return el
      },
      writable: true, configurable: true,
    })
  }
  if (!('createDiv' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'createDiv', {
      value: function (this: Node, o?: unknown): HTMLDivElement {
        const el = (window as unknown as { createDiv: (o?: unknown) => HTMLDivElement }).createDiv(o)
        // Guard: Document nodes cannot accept additional Element children via appendChild
        if (this.nodeType !== 9) {
          this.appendChild(el)
        }
        return el
      },
      writable: true, configurable: true,
    })
  }
  if (!('createSpan' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'createSpan', {
      value: function (this: Node, o?: unknown): HTMLSpanElement {
        const el = (window as unknown as { createSpan: (o?: unknown) => HTMLSpanElement }).createSpan(o)
        // Guard: Document nodes cannot accept additional Element children via appendChild
        if (this.nodeType !== 9) {
          this.appendChild(el)
        }
        return el
      },
      writable: true, configurable: true,
    })
  }

  // NOTE: Array.prototype.remove and String.prototype.contains are installed by
  // './global-extensions', imported at the top of this module. Duplicate copies
  // used to live here but were unreachable — global-extensions runs first and
  // both sites guard with `if (!('x' in Y.prototype))`.


  // ─── Icon Registry (synchronous) ──────────────────────────────────────────
  // Plugins call addIcon() during onload() to register custom SVG icons.
  // These must be available synchronously before addRibbonIcon() is called.
  if (!(window as unknown as { __obsidianCustomIcons?: unknown }).__obsidianCustomIcons) {
    ;(window as unknown as { __obsidianCustomIcons: Map<string, string> }).__obsidianCustomIcons = new Map()
  }
  const customIconsRef = (window as unknown as { __obsidianCustomIcons: Map<string, string> }).__obsidianCustomIcons

  if (!window.obsidian.addIcon) {
    window.obsidian.addIcon = (iconId: string, svgContent: string): void => {
      customIconsRef.set(iconId, svgContent)
    }
  }
  if (!window.obsidian.removeIcon) {
    window.obsidian.removeIcon = (iconId: string): void => {
      customIconsRef.delete(iconId)
    }
  }
  if (!window.obsidian.getIcon) {
    window.obsidian.getIcon = (iconId: string): SVGSVGElement | null => {
      const svg = customIconsRef.get(iconId)
      if (svg) {
        const container = document.createElement('div')
        container.innerHTML = svg
        return container.querySelector('svg') ?? null
      }
      return null
    }
  }
  if (!window.obsidian.getIconIds) {
    window.obsidian.getIconIds = (): string[] => {
      return Array.from(customIconsRef.keys())
    }
  }
  if (!window.obsidian.setIcon) {
    window.obsidian.setIcon = (parent: HTMLElement, iconId: string): void => {
      parent.innerHTML = ''
      const svg = customIconsRef.get(iconId)
      if (svg) { parent.innerHTML = svg; return }
      // Fallback: empty SVG placeholder
      const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      placeholder.setAttribute('data-icon', iconId)
      placeholder.setAttribute('width', '16')
      placeholder.setAttribute('height', '16')
      parent.appendChild(placeholder)
    }
  }

  // Obsidian exposes `activeWindow` and `activeDocument` as globals pointing to
  // the currently focused window/document (for multi-window support).
  // In Slatebase, there's always a single window.
  if (!(window as unknown as { activeWindow?: unknown }).activeWindow) {
    (window as unknown as { activeWindow: Window }).activeWindow = window
  }
  if (!(window as unknown as { activeDocument?: unknown }).activeDocument) {
    (window as unknown as { activeDocument: Document }).activeDocument = document
  }

  // Obsidian exposes global `sleep(ms)` and `nextFrame()` utility functions.
  if (!(window as unknown as { sleep?: unknown }).sleep) {
    (window as unknown as { sleep: (ms: number) => Promise<void> }).sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  }
  if (!(window as unknown as { nextFrame?: unknown }).nextFrame) {
    (window as unknown as { nextFrame: () => Promise<void> }).nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))
  }

  // Obsidian exposes the Workspace class itself on window.obsidian so plugins
  // can monkey-patch its prototype (e.g. Templater patches getActiveViewOfType).
  if (!window.obsidian.Workspace) {
    // Create a dummy class whose prototype plugins can patch.
    // The real WorkspaceShim instance is separate — patches on this prototype
    // won't affect it, but plugins won't crash trying to access .prototype.
    window.obsidian.Workspace = class Workspace {} as unknown as Record<string, unknown>
  }

  // Component — Obsidian's base class for lifecycle management.
  // Views, Plugins, and other managed objects extend Component.
  // Provides: load, unload, addChild, removeChild, register, registerEvent, registerInterval, registerDomEvent.
  if (!window.obsidian.Component) {
    window.obsidian.Component = class Component {
      private _children: unknown[] = []
      private _loaded: boolean = false
      private _events: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject }> = []
      private _intervals: number[] = []
      private _cleanups: Array<() => void> = []

      load(): void {
        this._loaded = true
        this.onload()
      }
      onload(): void {}
      unload(): void {
        this._loaded = false
        // Clean up registered intervals
        for (const id of this._intervals) clearInterval(id)
        this._intervals = []
        // Clean up registered DOM events
        for (const { target, event, handler } of this._events) {
          target.removeEventListener(event, handler)
        }
        this._events = []
        // Run cleanup callbacks
        for (const fn of this._cleanups) { try { fn() } catch { /* ignore */ } }
        this._cleanups = []
        // Unload children
        for (const child of this._children) {
          if (child && typeof child === 'object' && 'unload' in child) {
            (child as { unload: () => void }).unload()
          }
        }
        this._children = []
        this.onunload()
      }
      onunload(): void {}
      addChild<T>(child: T): T {
        this._children.push(child)
        if (this._loaded && child && typeof child === 'object' && 'load' in child) {
          (child as { load: () => void }).load()
        }
        return child
      }
      removeChild<T>(child: T): T {
        const idx = this._children.indexOf(child)
        if (idx >= 0) this._children.splice(idx, 1)
        if (child && typeof child === 'object' && 'unload' in child) {
          (child as { unload: () => void }).unload()
        }
        return child
      }
      register(cb: unknown): void {
        if (typeof cb === 'function') this._cleanups.push(cb as () => void)
      }
      registerEvent(_ref: unknown): void {}
      registerInterval(id: number): number {
        this._intervals.push(id)
        return id
      }
      registerDomEvent(el: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void {
        el.addEventListener(event, handler)
        this._events.push({ target: el, event, handler })
      }
    } as unknown as Record<string, unknown>
  }

  // EditorSuggest — Base class for autocomplete suggestions (Kanban DateSuggest/TimeSuggest).
  // Must be defined early — class heritage evaluates at bundle parse time.
  if (!window.obsidian.EditorSuggest) {
    window.obsidian.EditorSuggest = class EditorSuggest {
      app: unknown
      context: unknown = null
      limit: number = 20
      suggestEl: HTMLElement
      scope = {
        keys: [] as unknown[],
        register: (_modifiers: string[], _key: string | null, _callback: () => boolean | void) => {
          const handler = { modifiers: _modifiers, key: _key, func: _callback }
          return handler
        },
        unregister: (_handler: unknown) => {},
      }
      constructor(app: unknown) {
        this.app = app
        this.suggestEl = document.createElement('div')
        this.suggestEl.className = 'suggestion-container'
      }
      open(): void {}
      close(): void {}
      getSuggestions(_context: unknown): unknown[] { return [] }
      renderSuggestion(_value: unknown, _el: HTMLElement): void {}
      selectSuggestion(_value: unknown, _evt: unknown): void {}
      onTrigger(_cursor: unknown, _editor: unknown, _file: unknown): unknown { return null }
    } as unknown as Record<string, unknown>
  }

  // Obsidian exposes `window.app` as a global reference to the app instance.
  // Many plugins and libraries (like obsidian-daily-notes-interface) access it directly.
  if (!(window as unknown as { app?: unknown }).app) {
    (window as unknown as { app: Record<string, unknown> }).app = {
      internalPlugins: {
        plugins: {
          'daily-notes': { enabled: true, instance: { options: { format: 'YYYY-MM-DD', folder: '', template: '' } } },
          'templates': { enabled: false, instance: { options: { folder: '' } } },
        },
        getPluginById: (id: string) => {
          const plugins = ((window as unknown as { app: { internalPlugins: { plugins: Record<string, unknown> } } }).app.internalPlugins.plugins)
          return plugins[id] ?? { enabled: false, instance: { options: {} } }
        },
      },
      plugins: {
        plugins: {},
        enabledPlugins: new Set<string>(),
        getPlugin: () => undefined,
      },
      vault: {},
      workspace: {},
      metadataCache: {},
      foldManager: { save: () => {}, load: () => {}, getFolds: () => [] },
      embedRegistry: {
        embedByExtension: {
          md: () => {
            // Kanban calls this to extract the internal MarkdownEditor class.
            // It gets the constructor via Object.getPrototypeOf chain on editMode,
            // then extends it. The class needs set(), get(), destroy(), cm property.
            const FakeEditor = class {
              cm: unknown = null
              constructor() {}
              set(_value: string) {}
              get(): string { return '' }
              destroy() {}
            }
            const editMode = Object.create(Object.create(FakeEditor.prototype))
            return {
              load: () => {},
              unload: () => {},
              editable: false,
              showEditor: () => {},
              editMode,
            }
          },
        },
      },
      commands: {
        commands: {},
        executeCommand: (_command: unknown) => {},
      },
    }
  }

  // Obsidian extends HTMLElement with convenience methods.
  // Plugins use these everywhere (containerEl.empty(), containerEl.createEl(), etc.)
  if (!Object.hasOwn(HTMLElement.prototype, 'empty')) {
    Object.defineProperty(HTMLElement.prototype, 'empty', {
      value: function (this: HTMLElement) {
        this.innerHTML = ''
        return this
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'createEl')) {
    Object.defineProperty(HTMLElement.prototype, 'createEl', {
      value: function (this: HTMLElement, tag: string, o?: unknown, cb?: (el: HTMLElement) => void) {
        const el = document.createElement(tag)
        // Obsidian overload: createEl(tag, options?, callback?)
        // - options can be { cls, text, attr, type, href, placeholder, value }
        // - callback receives the created element for imperative population
        let callback: ((el: HTMLElement) => void) | undefined = cb
        if (typeof o === 'function') {
          // createEl(tag, callback) — no options, second arg is the callback
          callback = o as (el: HTMLElement) => void
        } else if (o && typeof o === 'object') {
          const options = o as { cls?: string; text?: string; attr?: Record<string, string>; type?: string; href?: string; placeholder?: string; value?: string }
          if (options.cls) el.className = options.cls
          if (options.text) el.textContent = options.text
          if (options.attr) {
            for (const [k, v] of Object.entries(options.attr)) {
              el.setAttribute(k, v)
            }
          }
          if (options.type) (el as HTMLInputElement).type = options.type
          if (options.href) (el as HTMLAnchorElement).href = options.href
          if (options.placeholder) (el as HTMLInputElement).placeholder = options.placeholder
          if (options.value) (el as HTMLInputElement).value = options.value
        }
        this.appendChild(el)
        if (callback) callback(el)
        return el
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'createDiv')) {
    Object.defineProperty(HTMLElement.prototype, 'createDiv', {
      value: function (this: HTMLElement, o?: unknown, cb?: (el: HTMLElement) => void) {
        // Obsidian overload: createDiv(cls: string, callback?) or createDiv(options?, callback?)
        let options: { cls?: string; text?: string } | undefined
        let callback: ((el: HTMLElement) => void) | undefined = cb
        if (typeof o === 'string') {
          options = { cls: o }
          if (typeof cb === 'function') callback = cb
        } else if (typeof o === 'function') {
          callback = o as (el: HTMLElement) => void
        } else if (o && typeof o === 'object') {
          options = o as { cls?: string; text?: string }
        }
        return (this as unknown as { createEl: (tag: string, opts?: unknown, cb?: (el: HTMLElement) => void) => HTMLElement }).createEl('div', options, callback)
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'createSpan')) {
    Object.defineProperty(HTMLElement.prototype, 'createSpan', {
      value: function (this: HTMLElement, o?: unknown, cb?: (el: HTMLElement) => void) {
        // Obsidian overload: createSpan(cls: string, callback?) or createSpan(options?, callback?)
        let options: { cls?: string; text?: string } | undefined
        let callback: ((el: HTMLElement) => void) | undefined = cb
        if (typeof o === 'string') {
          options = { cls: o }
          if (typeof cb === 'function') callback = cb
        } else if (typeof o === 'function') {
          callback = o as (el: HTMLElement) => void
        } else if (o && typeof o === 'object') {
          options = o as { cls?: string; text?: string }
        }
        return (this as unknown as { createEl: (tag: string, opts?: unknown, cb?: (el: HTMLElement) => void) => HTMLElement }).createEl('span', options, callback)
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'addClass')) {
    Object.defineProperty(HTMLElement.prototype, 'addClass', {
      value: function (this: HTMLElement, ...classes: string[]) {
        this.classList.add(...classes)
        return this
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'removeClass')) {
    Object.defineProperty(HTMLElement.prototype, 'removeClass', {
      value: function (this: HTMLElement, ...classes: string[]) {
        this.classList.remove(...classes)
        return this
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'toggleClass')) {
    Object.defineProperty(HTMLElement.prototype, 'toggleClass', {
      value: function (this: HTMLElement, cls: string, force?: boolean) {
        this.classList.toggle(cls, force)
        return this
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'hasClass')) {
    Object.defineProperty(HTMLElement.prototype, 'hasClass', {
      value: function (this: HTMLElement, cls: string) {
        return this.classList.contains(cls)
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'setText')) {
    Object.defineProperty(HTMLElement.prototype, 'setText', {
      value: function (this: HTMLElement, text: string) {
        this.textContent = text
        return this
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'setCssProps')) {
    Object.defineProperty(HTMLElement.prototype, 'setCssProps', {
      value: function (this: HTMLElement, props: Record<string, string>) {
        for (const [key, value] of Object.entries(props)) {
          this.style.setProperty(key, value)
        }
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'setCssStyles')) {
    Object.defineProperty(HTMLElement.prototype, 'setCssStyles', {
      value: function (this: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
        Object.assign(this.style, styles)
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'onWindowMigrated')) {
    Object.defineProperty(HTMLElement.prototype, 'onWindowMigrated', {
      value: function (_callback: () => void) {
        // No-op — Slatebase has a single window (no pop-out support)
        return () => {}
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'onNodeInserted')) {
    Object.defineProperty(HTMLElement.prototype, 'onNodeInserted', {
      value: function (_callback: () => void) {
        return () => {}
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'on')) {
    Object.defineProperty(HTMLElement.prototype, 'on', {
      value: function (this: HTMLElement, event: string, selectorOrHandler: unknown, handler?: unknown) {
        // Obsidian overload: on(event, selector, handler) or on(event, handler)
        const actualHandler = typeof selectorOrHandler === 'function'
          ? selectorOrHandler as EventListener
          : handler as EventListener
        const selector = typeof selectorOrHandler === 'string' ? selectorOrHandler : null
        if (selector) {
          // Event delegation: listen on parent, filter by selector
          const delegated = (evt: Event) => {
            const target = (evt.target as HTMLElement)?.closest?.(selector)
            if (target && this.contains(target)) {
              actualHandler.call(target, evt)
            }
          }
          this.addEventListener(event, delegated)
        } else {
          this.addEventListener(event, actualHandler)
        }
      },
      writable: true,
      configurable: true,
    })
  }
  if (!Object.hasOwn(HTMLElement.prototype, 'off')) {
    Object.defineProperty(HTMLElement.prototype, 'off', {
      value: function (this: HTMLElement, event: string, handler: EventListener) {
        this.removeEventListener(event, handler)
      },
      writable: true,
      configurable: true,
    })
  }

  // ─── Global standalone DOM helper functions (Obsidian exposes these on window) ───
  // Unlike the HTMLElement.prototype methods (which append to `this`), these create
  // detached elements that are not appended to any parent.

  const win = window as unknown as Record<string, unknown>

  if (!win.createEl) {
    win.createEl = function createEl(tag: string, o?: unknown, cb?: (el: HTMLElement) => void): HTMLElement {
      const el = document.createElement(tag)
      let callback: ((el: HTMLElement) => void) | undefined = cb
      if (typeof o === 'function') {
        callback = o as (el: HTMLElement) => void
      } else if (o && typeof o === 'object') {
        const options = o as { cls?: string; text?: string; attr?: Record<string, string>; type?: string; href?: string; placeholder?: string; value?: string }
        if (options.cls) el.className = options.cls
        if (options.text) el.textContent = options.text
        if (options.attr) {
          for (const [k, v] of Object.entries(options.attr)) {
            el.setAttribute(k, v)
          }
        }
        if (options.type) (el as HTMLInputElement).type = options.type
        if (options.href) (el as HTMLAnchorElement).href = options.href
        if (options.placeholder) (el as HTMLInputElement).placeholder = options.placeholder
        if (options.value) (el as HTMLInputElement).value = options.value
      }
      if (callback) callback(el)
      return el
    }
  }

  if (!win.createDiv) {
    win.createDiv = function createDiv(o?: unknown, cb?: (el: HTMLElement) => void): HTMLElement {
      let options: { cls?: string; text?: string } | undefined
      let callback: ((el: HTMLElement) => void) | undefined = cb
      if (typeof o === 'string') {
        options = { cls: o }
      } else if (typeof o === 'function') {
        callback = o as (el: HTMLElement) => void
      } else if (o && typeof o === 'object') {
        options = o as { cls?: string; text?: string }
      }
      return (win.createEl as (tag: string, opts?: unknown, cb?: (el: HTMLElement) => void) => HTMLElement)('div', options, callback)
    }
  }

  if (!win.createSpan) {
    win.createSpan = function createSpan(o?: unknown, cb?: (el: HTMLElement) => void): HTMLElement {
      let options: { cls?: string; text?: string } | undefined
      let callback: ((el: HTMLElement) => void) | undefined = cb
      if (typeof o === 'string') {
        options = { cls: o }
      } else if (typeof o === 'function') {
        callback = o as (el: HTMLElement) => void
      } else if (o && typeof o === 'object') {
        options = o as { cls?: string; text?: string }
      }
      return (win.createEl as (tag: string, opts?: unknown, cb?: (el: HTMLElement) => void) => HTMLElement)('span', options, callback)
    }
  }

  if (!win.createFragment) {
    win.createFragment = function createFragment(cb?: (frag: DocumentFragment) => void): DocumentFragment {
      const frag = document.createDocumentFragment()
      if (cb) cb(frag)
      return frag
    }
  }

  // Plugin base class — plugins extend this via `class MyPlugin extends Plugin`
  // The constructor receives the app instance from the PluginLoader
  if (!window.obsidian.Plugin) {
    window.obsidian.Plugin = class Plugin {
      app: unknown
      manifest: unknown
      private _children: unknown[] = []
      private _intervals: number[] = []
      private _events: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject }> = []
      /** Scope — Obsidian's keymap manager for plugin hotkeys */
      scope = {
        keys: function(..._args: unknown[]) { return { scope: this } },
        register: (_modifiers: string[], _key: string | null, _callback: () => boolean | void) => ({ scope: null }),
        unregister: (_handler: unknown) => {},
      }
      constructor(app: unknown) {
        this.app = app
        this.manifest = {}
        this._children = []
        this._intervals = []
        this._events = []
      }
      onload() {}
      onunload() {}
      load() { this.onload() }
      unload() { this.onunload() }
      addChild<T>(child: T): T {
        this._children.push(child)
        if (child && typeof child === 'object' && 'load' in child) {
          (child as { load: () => void }).load()
        }
        return child
      }
      removeChild<T>(child: T): T {
        const idx = this._children.indexOf(child)
        if (idx >= 0) this._children.splice(idx, 1)
        if (child && typeof child === 'object' && 'unload' in child) {
          (child as { unload: () => void }).unload()
        }
        return child
      }
      async loadData(): Promise<unknown> { return null }
       
      async saveData(_data: unknown): Promise<void> {}
       
      addCommand(_cmd: unknown): void {}
       
      addSettingTab(_tab: unknown): void {}
       
      registerEvent(_ref: unknown): void {}
       
      registerView(_viewType: string, _creator: unknown): void {}
      /** Register a callback that runs on an interval (auto-cleared on unload) */
      registerInterval(interval: number): number {
        this._intervals.push(interval)
        return interval
      }
      /** Register a DOM event listener (auto-removed on unload) */
      registerDomEvent(el: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void {
        el.addEventListener(event, handler)
        this._events.push({ target: el, event, handler })
      }
      /** General register method — in Obsidian this handles various cleanup registrations */
      register(cb: unknown): void {
        // In Obsidian, register() accepts a cleanup callback that runs on unload.
        // We just invoke it if it's a function that returns a cleanup, or store it.
        if (typeof cb === 'function') {
          // Some plugins pass an interval ID here
          this._intervals.push(cb as unknown as number)
        }
      }
      addRibbonIcon(icon: string, title: string, callback: () => void): HTMLElement {
        const pluginId = (this.manifest as { id?: string })?.id ?? 'unknown'
        return registerRibbonIcon(pluginId, icon, title, callback)
      }
      addStatusBarItem(): HTMLElement {
        const pluginId = (this.manifest as { id?: string })?.id ?? 'unknown'
        return registerStatusBarItem(pluginId)
      }
      /** Register an editor suggest (autocomplete). Not implemented in Slatebase. */
      registerEditorSuggest(_suggest: unknown): void {
        const pluginId = (this.manifest as { id?: string })?.id ?? 'unknown'
        warnNoOp(pluginId, 'registerEditorSuggest')
      }
      /**
       * Register a hover link source. Delegates to the workspace, as Obsidian
       * does — the two must not disagree, since plugins reach for either.
       */
      registerHoverLinkSource(key: string, source: unknown): void {
        addHoverSource(key, typeof source === 'object' && source !== null
          ? (source as { display?: string })
          : undefined)
      }
      /** Withdraw a hover link source. Delegates to the workspace. */
      unregisterHoverLinkSource(key: string): void {
        removeHoverSource(key)
      }
      /** Register a markdown post processor. Stored but not executed in Slatebase. */
      registerMarkdownPostProcessor(_postProcessor: unknown, _sortOrder?: number): unknown {
        const pluginId = (this.manifest as { id?: string })?.id ?? 'unknown'
        warnNoOp(pluginId, 'registerMarkdownPostProcessor')
        return _postProcessor
      }
      /** Register a code block processor for a specific language. No-op stub. */
      registerMarkdownCodeBlockProcessor(_language: string, _handler: unknown, _sortOrder?: number): unknown { return _handler }
      /** Register a CodeMirror 6 extension. No-op in Slatebase. */
      registerEditorExtension(_extension: unknown): void {}
      /** Register file extensions for a view type. Not implemented in Slatebase. */
      registerExtensions(_extensions: string[], _viewType: string): void {
        const pluginId = (this.manifest as { id?: string })?.id ?? 'unknown'
        warnNoOp(pluginId, 'registerExtensions')
      }
      /** Register an obsidian:// protocol handler. Not applicable in Slatebase (web app). */
      registerObsidianProtocolHandler(_action: string, _handler: unknown): void {}
      /** Remove a previously registered command. No-op in Slatebase. */
      removeCommand(_commandId: string): void {}
      /** Register a CLI handler. Not applicable in Slatebase (no desktop CLI). */
      registerCliHandler(_command: string, _description: string, _flags: unknown, _handler: unknown): void {}
    } as unknown as Record<string, unknown>
  }

  window.obsidian.PluginSettingTab = PluginSettingTab
  window.obsidian.Setting = Setting
  // SettingTab — base class (PluginSettingTab extends it in Obsidian)
  if (!window.obsidian.SettingTab) {
    window.obsidian.SettingTab = PluginSettingTab
  }

  // BaseComponent — abstract base for all setting UI components.
  // Excalidraw extends this for custom settings controls.
  if (!window.obsidian.BaseComponent) {
    window.obsidian.BaseComponent = class BaseComponent {
      disabled = false
      then(cb: (component: unknown) => unknown): unknown { cb(this); return this }
      setDisabled(disabled: boolean): unknown { this.disabled = disabled; return this }
    } as unknown as Record<string, unknown>
  }

  // ValueComponent — extends BaseComponent with get/set value pattern.
  if (!window.obsidian.ValueComponent) {
    const BaseComp = window.obsidian.BaseComponent as { new (): unknown; prototype: object }
    window.obsidian.ValueComponent = class ValueComponent extends (BaseComp as unknown as { new (): { disabled: boolean; then(cb: unknown): unknown; setDisabled(d: boolean): unknown } }) {
      getValue(): unknown { return undefined }
      setValue(_value: unknown): unknown { return this }
      registerOptionListener(_listeners: unknown, _key: string): unknown { return this }
    } as unknown as Record<string, unknown>
  }

  window.obsidian.TextComponent = TextComponent
  window.obsidian.TextAreaComponent = TextAreaComponent
  window.obsidian.ToggleComponent = ToggleComponent
  window.obsidian.DropdownComponent = DropdownComponent
  window.obsidian.ButtonComponent = ButtonComponent
  window.obsidian.SliderComponent = SliderComponent

  // FileSystemAdapter — stub class for `instanceof` checks.
  // LiveSync uses `vault.adapter instanceof FileSystemAdapter` to detect desktop.
  if (!window.obsidian.FileSystemAdapter) {
    window.obsidian.FileSystemAdapter = class FileSystemAdapter {
      getName(): string { return 'slatebase' }
      getBasePath(): string { return '/' }
      getFullPath(path: string): string { return path }
      getFilePath(path: string): string { return path }
      getResourcePath(path: string): string { return path }
      async exists(_path: string): Promise<boolean> { return false }
      async stat(_path: string): Promise<unknown> { return null }
      async list(_path: string): Promise<{ files: string[]; folders: string[] }> { return { files: [], folders: [] } }
      async read(_path: string): Promise<string> { return '' }
      async readBinary(_path: string): Promise<ArrayBuffer> { return new ArrayBuffer(0) }
      async write(_path: string, _data: string): Promise<void> {}
      async writeBinary(_path: string, _data: ArrayBuffer): Promise<void> {}
      async append(_path: string, _data: string): Promise<void> {}
      async remove(_path: string): Promise<void> {}
      async rename(_path: string, _newPath: string): Promise<void> {}
      async copy(_path: string, _newPath: string): Promise<void> {}
      async mkdir(_path: string): Promise<void> {}
      async rmdir(_path: string, _recursive: boolean): Promise<void> {}
      async trashSystem(_path: string): Promise<boolean> { return false }
      async trashLocal(_path: string): Promise<void> {}
      async process(_path: string, fn: (data: string) => string): Promise<string> { return fn('') }
    } as unknown as Record<string, unknown>
  }

  // ─── Platform detection (used by Kanban, many others) ──────────────────

  // Derived from the actual device rather than hardcoded to desktop: the same
  // build serves a laptop and a phone browser. See ./platform-detection.
  if (!window.obsidian.Platform) {
    window.obsidian.Platform = detectPlatform(readPlatformEnvironment()) as unknown as Record<string, unknown>
  }

  // ─── Utility functions used by many plugins ────────────────────────────

  if (!window.obsidian.normalizePath) {
    window.obsidian.normalizePath = (path: string): string => {
      // Normalize path separators and remove leading/trailing slashes
      let normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/')
      if (normalized.startsWith('/')) normalized = normalized.slice(1)
      if (normalized.endsWith('/') && normalized.length > 1) normalized = normalized.slice(0, -1)
      return normalized || '/'
    }
  }

  // parseFrontMatterTags — extracts tags from YAML frontmatter object
  if (!window.obsidian.parseFrontMatterTags) {
    window.obsidian.parseFrontMatterTags = (frontmatter: unknown): string[] | null => {
      if (!frontmatter || typeof frontmatter !== 'object') return null
      const fm = frontmatter as Record<string, unknown>
      const tags = fm['tags'] ?? fm['tag']
      if (!tags) return null
      if (Array.isArray(tags)) return tags.map(t => typeof t === 'string' ? (t.startsWith('#') ? t : `#${t}`) : '')
      if (typeof tags === 'string') return tags.split(/[,\s]+/).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`)
      return null
    }
  }

  // Obsidian exposes a debounce utility: debounce(fn, delay, resetTimer?)
  // resetTimer defaults to true — each call resets the timer (trailing-edge).
  // When resetTimer is false, calls after the first are ignored until the timer fires.
  if (!window.obsidian.debounce) {
    window.obsidian.debounce = <T extends (...args: unknown[]) => unknown>(
      fn: T,
      delay: number,
      resetTimer = true,
    ): T & { cancel: () => void } => {
      let timerId: ReturnType<typeof setTimeout> | null = null
      const debounced = (...args: unknown[]) => {
        if (resetTimer) {
          if (timerId !== null) clearTimeout(timerId)
          timerId = setTimeout(() => { timerId = null; fn(...args) }, delay)
        } else {
          // Only schedule if not already waiting
          if (timerId === null) {
            timerId = setTimeout(() => { timerId = null; fn(...args) }, delay)
          }
        }
      }
      debounced.cancel = () => {
        if (timerId !== null) { clearTimeout(timerId); timerId = null }
      }
      return debounced as unknown as T & { cancel: () => void }
    }
  }

  // TFile class stub — some plugins use `instanceof obsidian.TFile`
  if (!window.obsidian.TFile) {
    window.obsidian.TFile = class TFile {
      path = ''
      name = ''
      basename = ''
      extension = ''
      stat = { mtime: 0, ctime: 0, size: 0 }
      parent: unknown = null
    } as unknown as Record<string, unknown>
  }

  // TFolder class stub — some plugins use `instanceof obsidian.TFolder`
  if (!window.obsidian.TFolder) {
    window.obsidian.TFolder = class TFolder {
      path = ''
      name = ''
      children: unknown[] = []
      parent: unknown = null
      isRoot() { return this.path === '' || this.path === '/' }
    } as unknown as Record<string, unknown>
  }

  // Vault static methods — some plugins use `Vault.recurseChildren(folder, cb)`
  if (!window.obsidian.Vault) {
    window.obsidian.Vault = {} as Record<string, unknown>
  }
  if (!(window.obsidian.Vault as Record<string, unknown>).recurseChildren) {
    (window.obsidian.Vault as Record<string, unknown>).recurseChildren = (
      root: { children?: unknown[] },
      callback: (file: unknown) => void,
    ): void => {
      if (!root || !root.children) return
      for (const child of root.children) {
        callback(child)
        // Recurse into folders
        if (child && typeof child === 'object' && 'children' in child) {
          (window.obsidian!.Vault as Record<string, unknown> & { recurseChildren: (r: unknown, cb: (f: unknown) => void) => void })
            .recurseChildren(child as { children?: unknown[] }, callback)
        }
      }
    }
  }

  // ItemView — base class for custom plugin views (Calendar, Kanban, etc.)
  if (!window.obsidian.ItemView) {
    window.obsidian.ItemView = class ItemView {
      containerEl: HTMLElement
      contentEl: HTMLElement
      app: unknown
      leaf: unknown
      private _eventRefs: Array<{ event: string; callback: (...args: unknown[]) => void }> = []
      constructor(leaf: unknown) {
        this.leaf = leaf
        this.app = leaf && typeof leaf === 'object' && 'app' in leaf ? (leaf as { app: unknown }).app : null
        this.containerEl = document.createElement('div')
        this.containerEl.className = 'plugin-view-container'
        this.contentEl = document.createElement('div')
        this.contentEl.className = 'plugin-view-content'
        this.containerEl.appendChild(this.contentEl)
      }
      getViewType(): string { return '' }
      getDisplayText(): string { return 'Plugin View' }
      getIcon(): string { return 'file' }
      async onOpen(): Promise<void> { /* plugins override */ }
      async onClose(): Promise<void> { /* plugins override */ }
      onload(): void {}
      onunload(): void {}
      /** Track an event subscription for automatic cleanup on view close. */
      registerEvent(eventRef: unknown): void {
        if (eventRef && typeof eventRef === 'object') {
          this._eventRefs.push(eventRef as { event: string; callback: (...args: unknown[]) => void })
        }
      }
      /** Register a generic cleanup callback (interval, DOM listener, etc.). */
      register(cb: unknown): void {
        if (typeof cb === 'function') {
          this._eventRefs.push({ event: '__cleanup__', callback: cb as () => void })
        }
      }
      /** Add a clickable action icon to the view header (no-op stub). */
      addAction(_icon: string, title: string, _callback: () => void): HTMLElement {
        warnNoOp('ItemView', 'addAction', `The "${title}" action will not appear in the view header.`)
        return document.createElement('a')
      }
    } as unknown as Record<string, unknown>
  }

  // WorkspaceLeaf stub — just enough for plugins to instantiate views with `new MyView(leaf)`
  if (!window.obsidian.WorkspaceLeaf) {
    window.obsidian.WorkspaceLeaf = class WorkspaceLeaf {
      app: unknown
      view: unknown = null
      constructor(app?: unknown) {
        this.app = app ?? null
      }
    } as unknown as Record<string, unknown>
  }

  // FileView — extends ItemView with a `file` property. Plugins use `view instanceof FileView`
  // to check whether the active leaf shows a file (Calendar, Periodic Notes, etc.).
  if (!window.obsidian.FileView) {
    const ItemViewClass = window.obsidian.ItemView as { new (leaf: unknown): unknown; prototype: object }
    window.obsidian.FileView = class FileView extends (ItemViewClass as unknown as { new (leaf: unknown): { containerEl: HTMLElement; contentEl: HTMLElement; app: unknown; leaf: unknown } }) {
      file: unknown = null
      allowNoFile = false
      canAcceptExtension(_extension: string): boolean { return false }
      getDisplayText(): string { return (this.file as { basename?: string })?.basename ?? 'File View' }
      getViewType(): string { return 'file' }
      onLoadFile(_file: unknown): Promise<void> { return Promise.resolve() }
      onUnloadFile(_file: unknown): Promise<void> { return Promise.resolve() }
    } as unknown as Record<string, unknown>
  }

  // TextFileView — extends FileView with text content management.
  // Plugins like Kanban extend this for file-backed views with getViewData/setViewData/requestSave.
  if (!window.obsidian.TextFileView) {
    const FileViewClass = window.obsidian.FileView as { new (leaf: unknown): unknown; prototype: object }
    window.obsidian.TextFileView = class TextFileView extends (FileViewClass as unknown as { new (leaf: unknown): { containerEl: HTMLElement; contentEl: HTMLElement; app: unknown; leaf: unknown; file: unknown; _loaded: boolean } }) {
      data: string = ''
      private _saveRequested: boolean = false
      private _saveTimerId: ReturnType<typeof setTimeout> | null = null
      getViewType(): string { return '' }
      getDisplayText(): string { return (this.file as { basename?: string })?.basename ?? 'File View' }
      /** Get view data — plugins override to serialize state to text. */
      getViewData(): string { return this.data }
      /** Set view data — plugins override to parse and render content. */
      setViewData(_data: string, _clear?: boolean): void { this.data = _data }
      /** Clear internal state — plugins override for reset between file loads. */
      clear(): void { /* plugins override */ }
      /** Request a debounced save to disk. */
      requestSave(): void {
        this._saveRequested = true
        if (this._saveTimerId !== null) clearTimeout(this._saveTimerId)
        this._saveTimerId = setTimeout(() => {
          this._saveTimerId = null
          void this.save(false)
        }, 2000)
      }
      /** Perform the save — writes getViewData() to the vault via vault.modify. */
      async save(force: boolean): Promise<void> {
        if (!force && !this._saveRequested) return
        if (!this.file) return
        if (this._saveTimerId !== null) { clearTimeout(this._saveTimerId); this._saveTimerId = null }
        this._saveRequested = false
        const newData = this.getViewData()
        this.data = newData
        try {
          const vault = (this.app as { vault?: { modify: (f: unknown, content: string) => Promise<void> } })?.vault
          if (vault) await vault.modify(this.file, newData)
        } catch (err) { console.error('[TextFileView] Failed to save:', err) }
      }
      /** Load a file into this view. */
      async loadFile(file: unknown): Promise<void> {
        if (this.file && this.file !== file) await this.onUnloadFile(this.file)
        this.file = file
        try {
          const vault = (this.app as { vault?: { read: (f: unknown) => Promise<string> } })?.vault
          if (vault) this.data = await vault.read(file)
          else this.data = ''
        } catch { this.data = '' }
        await this.onLoadFile(file)
      }
      async onLoadFile(_file: unknown): Promise<void> { this.setViewData(this.data, true) }
      async onUnloadFile(_file: unknown): Promise<void> { await this.save(true) }
      async onClose(): Promise<void> {
        if (this.file) await this.onUnloadFile(this.file)
        if (this._saveTimerId !== null) { clearTimeout(this._saveTimerId); this._saveTimerId = null }
      }
      getState(): Record<string, unknown> { return { file: (this.file as { path?: string })?.path ?? null } }
      async setState(state: Record<string, unknown>, _result: unknown): Promise<void> {
        if (state.file && typeof state.file === 'string') {
          const vault = (this.app as { vault?: { getAbstractFileByPath: (path: string) => unknown } })?.vault
          const file = vault?.getAbstractFileByPath(state.file as string)
          if (file) await this.loadFile(file)
        }
      }
      addChild<T>(child: T): T {
        if (this._loaded && child && typeof child === 'object' && 'load' in child) {
          (child as { load: () => void }).load()
        }
        return child
      }
      removeChild<T>(child: T): T {
        if (child && typeof child === 'object' && 'unload' in child) {
          (child as { unload: () => void }).unload()
        }
        return child
      }
      register(_cb: unknown): void { /* no-op */ }
    } as unknown as Record<string, unknown>
  }

  // MarkdownView — plugins use `getActiveViewOfType(MarkdownView)` to check if the
  // active leaf is editing a markdown file. Extends FileView with editor property.
  if (!window.obsidian.MarkdownView) {
    const FileViewClass = window.obsidian.FileView as { new (leaf: unknown): unknown; prototype: object }
    window.obsidian.MarkdownView = class MarkdownView extends (FileViewClass as unknown as { new (leaf: unknown): { containerEl: HTMLElement; contentEl: HTMLElement; app: unknown; leaf: unknown; file: unknown } }) {
      /** Returns 'markdown' as the view type identifier. */
      getViewType(): string { return 'markdown' }
      getDisplayText(): string { return (this.file as { basename?: string })?.basename ?? 'Markdown' }
      /** The editor instance (EditorShim when available). */
      get editor(): unknown {
        const workspace = (this.app as { workspace?: { activeEditor?: { editor: unknown } } })?.workspace
        return workspace?.activeEditor?.editor ?? null
      }
      /** Current edit mode: 'source' (editing) or 'preview' (reading). */
      getMode(): string { return 'source' }
      /** Request save — no-op in our implementation, auto-save handles it. */
      requestSave(): void { /* no-op */ }
    } as unknown as Record<string, unknown>
  }

  // ─── Moment.js global (required by Calendar, Periodic Notes, and many others) ──
  // Obsidian exposes moment globally as `window.moment`. Plugins access it directly
  // (e.g. `window.moment.weekdays()`) and via `require('obsidian').moment`.
  // We import the real moment library to ensure full API compatibility.

  // Register locale data directly on our moment instance.
  // We use moment/min/moment-with-locales which includes all ~130 locales,
  // just like Obsidian does. This ensures any locale a plugin requests is available.

  // Set the active locale from browser language (like Obsidian does at startup)
  const browserLang = (navigator.language ?? 'en').toLowerCase()
  const desiredLocale = browserLang.startsWith('de') ? 'de' : browserLang.split('-')[0]
  moment.locale(desiredLocale)

  ;(window as unknown as { moment: typeof moment }).moment = moment

  // Obsidian caches the initial locale week spec as `window._bundledLocaleWeekSpec`
  // so plugins (Calendar) can restore it after user overrides.
  if (!(window as unknown as { _bundledLocaleWeekSpec?: unknown })._bundledLocaleWeekSpec) {
    ;(window as unknown as { _bundledLocaleWeekSpec: unknown })._bundledLocaleWeekSpec =
      (moment.localeData() as unknown as { _week: unknown })._week
  }

  // Also expose on the obsidian module shim
  window.obsidian.moment = moment

  // Common Obsidian API stubs that plugins may reference
  if (!window.obsidian.Notice) {
    window.obsidian.Notice = class Notice {
      noticeEl: HTMLElement & { isShown?: () => boolean }
      messageEl: HTMLElement = document.createElement('div')
      containerEl: HTMLElement = document.createElement('div')
      private _shown = true
       
      constructor(message: string | DocumentFragment, _timeout?: number) {
        this.noticeEl = document.createElement('div') as HTMLElement & { isShown?: () => boolean }
        this.noticeEl.isShown = () => this._shown
        const msg = typeof message === 'string' ? message : (message?.textContent ?? '')
        if ((window as unknown as { __slatebaseShowNotice?: (msg: string, duration?: number) => void }).__slatebaseShowNotice) {
          (window as unknown as { __slatebaseShowNotice: (msg: string, duration?: number) => void }).__slatebaseShowNotice(msg, _timeout)
        }
      }
      setMessage(message: string | DocumentFragment): this {
        const msg = typeof message === 'string' ? message : (message?.textContent ?? '')
        if ((window as unknown as { __slatebaseShowNotice?: (msg: string) => void }).__slatebaseShowNotice) {
          (window as unknown as { __slatebaseShowNotice: (msg: string) => void }).__slatebaseShowNotice(msg)
        }
        return this
      }
      hide() { this._shown = false }
      isShown(): boolean { return this._shown }
    } as unknown as Record<string, unknown>
  }
  if (!window.obsidian.Modal) {
    window.obsidian.Modal = class Modal {
      app: unknown
      containerEl: HTMLElement
      modalEl: HTMLElement
      titleEl: HTMLElement
      contentEl: HTMLElement
      scope: { register: (_m: unknown, _k: unknown, _cb: unknown) => unknown; unregister: (_h: unknown) => void }
      private overlayEl: HTMLElement | null = null
      constructor(app: unknown) {
        this.app = app
        this.containerEl = document.createElement('div')
        this.containerEl.className = 'modal-container'
        this.modalEl = document.createElement('div')
        this.modalEl.className = 'modal'
        this.titleEl = document.createElement('div')
        this.titleEl.className = 'modal-title'
        this.contentEl = document.createElement('div')
        this.contentEl.className = 'modal-content'
        this.modalEl.appendChild(this.titleEl)
        this.modalEl.appendChild(this.contentEl)
        this.containerEl.appendChild(this.modalEl)
        this.scope = { register: () => ({}), unregister: () => {} }
      }
      setTitle(title: string): unknown {
        this.titleEl.textContent = title
        return this
      }
      setContent(content: string): unknown {
        this.contentEl.innerHTML = ''
        this.contentEl.textContent = content
        return this
      }
      isShown(): boolean {
        return this.overlayEl != null && this.overlayEl.parentNode != null
      }
      open() {
        // Create overlay backdrop
        this.overlayEl = document.createElement('div')
        this.overlayEl.className = 'modal-bg'
        this.overlayEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;'
        this.containerEl.style.cssText = 'background:var(--bg-surface,#fff);border-radius:8px;padding:16px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;'
        this.overlayEl.appendChild(this.containerEl)
        // Close on backdrop click
        this.overlayEl.addEventListener('click', (e) => {
          if (e.target === this.overlayEl) this.close()
        })
        document.body.appendChild(this.overlayEl)
        try {
          this.onOpen()
        } catch (err: unknown) {
          // Show the error inside the modal so developers can see what API is missing
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error('[Modal.open] onOpen() threw:', err)
          this.contentEl.innerHTML = `<div style="color:var(--text-error,#e53935);padding:12px;font-size:13px;"><strong>Modal-Fehler:</strong> ${errMsg}</div>`
        }
      }
      close() {
        this.onClose()
        if (this.overlayEl && this.overlayEl.parentNode) {
          this.overlayEl.parentNode.removeChild(this.overlayEl)
        }
        this.overlayEl = null
      }
      onOpen() {}
      onClose() {}
    } as unknown as Record<string, unknown>
  }

  // requireApiVersion — plugins call this to check Obsidian API version compatibility.
  // We emulate 1.4.0, so all version checks pass (return true).
  if (!window.obsidian.requireApiVersion) {
    window.obsidian.requireApiVersion = (_version: string): boolean => true
  }

  // getLanguage — returns the app's current locale code (e.g. 'en', 'de').
  // Excalidraw and other i18n-aware plugins use this.
  if (!window.obsidian.getLanguage) {
    window.obsidian.getLanguage = (): string => {
      const lang = navigator.language?.split('-')[0] ?? 'en'
      return lang
    }
  }

  // MarkdownRenderChild — base class for rendered markdown child elements.
  // Dataview and other rendering plugins extend this to manage lifecycle of embedded content.
  if (!window.obsidian.MarkdownRenderChild) {
    const ComponentClass = window.obsidian.Component as { new (): unknown; prototype: object }
    window.obsidian.MarkdownRenderChild = class MarkdownRenderChild extends (ComponentClass as unknown as { new (): { load(): void; unload(): void; onload(): void; onunload(): void; register(cb: unknown): void; registerEvent(ref: unknown): void } }) {
      containerEl: HTMLElement
      constructor(containerEl: HTMLElement) {
        super()
        this.containerEl = containerEl
      }
    } as unknown as Record<string, unknown>
  }

  // ConfirmationModal — extends Modal with a confirm/cancel pattern.
  // Templater and other plugins extend this for user confirmation dialogs.
  if (!window.obsidian.ConfirmationModal) {
    const ModalClass = window.obsidian.Modal as { new (app: unknown): unknown; prototype: object }
    window.obsidian.ConfirmationModal = class ConfirmationModal extends (ModalClass as unknown as { new (app: unknown): { app: unknown; containerEl: HTMLElement; contentEl: HTMLElement; open(): void; close(): void; onOpen(): void; onClose(): void } }) {
      constructor(app: unknown) {
        super(app)
      }
    } as unknown as Record<string, unknown>
  }

  // SettingPage — Base class for sub-pages within a SettingTab (Obsidian 1.13.0+).
  // Templater extends this for its settings pages.
  if (!window.obsidian.SettingPage) {
    window.obsidian.SettingPage = class SettingPage {
      rootEl: HTMLElement
      titlebarEl: HTMLElement
      containerEl: HTMLElement
      title = ''
      constructor() {
        this.rootEl = document.createElement('div')
        this.rootEl.className = 'setting-page'
        this.titlebarEl = document.createElement('div')
        this.titlebarEl.className = 'setting-page-titlebar'
        this.containerEl = document.createElement('div')
        this.containerEl.className = 'setting-page-content'
        this.rootEl.appendChild(this.titlebarEl)
        this.rootEl.appendChild(this.containerEl)
      }
      display(): void {}
      hide(): void {}
    } as unknown as Record<string, unknown>
  }

  if (!window.obsidian.Menu) {
    window.obsidian.Menu = class Menu {
      items: Array<{ title: string; icon: string; section: string; checked: boolean; callback: () => void }> = []
      containerEl: HTMLElement | null = null
      addItem(cb: (item: unknown) => void): this {
        const item = Menu._createItem()
        cb(item)
        this.items.push(item)
        return this
      }
      addSeparator(): this { return this }
      /** @internal Create a menu item with all methods Obsidian plugins expect. */
      static _createItem(): Record<string, unknown> & { title: string; icon: string; section: string; checked: boolean; callback: () => void } {
        const item = {
          title: '', icon: '', section: '', checked: false, callback: () => {},
          setTitle(t: string) { this.title = t; return this },
          setIcon(i: string) { this.icon = i; return this },
          setSection(s: string) { this.section = s; return this },
          setChecked(c: boolean) { this.checked = c; return this },
          setDisabled(_d: boolean) { return this },
          onClick(fn: () => void) { this.callback = fn; return this },
          setSubmenu(cb?: unknown) {
            // Obsidian API: setSubmenu() returns a new Menu (no-arg overload)
            // OR setSubmenu(cb) calls cb with a new Menu (callback overload)
            const submenu = new Menu()
            if (typeof cb === 'function') {
              ;(cb as (m: unknown) => void)(submenu)
              return this
            }
            // No-arg: return the submenu directly (Kanban uses this pattern)
            return submenu
          },
        }
        return item
      }
      showAtMouseEvent(evt: MouseEvent): void {
        this.show(evt.clientX, evt.clientY)
      }
      showAtPosition(pos: { x: number; y: number }): void {
        this.show(pos.x, pos.y)
      }
      private show(x: number, y: number): void {
        // Create menu DOM
        const overlay = document.createElement('div')
        overlay.className = 'menu-overlay'
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;'
        const menu = document.createElement('div')
        menu.className = 'menu'
        menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:var(--bg-surface,#fff);border:1px solid var(--border-color,#ccc);border-radius:6px;padding:4px 0;min-width:160px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:10000;`
        for (const item of this.items) {
          const el = document.createElement('div')
          el.className = 'menu-item'
          el.style.cssText = 'padding:6px 12px;cursor:pointer;font-size:13px;'
          el.textContent = item.title
          el.addEventListener('click', () => { item.callback(); this.close() })
          el.addEventListener('mouseenter', () => { el.style.background = 'var(--bg-hover,#f0f0f0)' })
          el.addEventListener('mouseleave', () => { el.style.background = '' })
          menu.appendChild(el)
        }
        overlay.appendChild(menu)
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close() })
        document.body.appendChild(overlay)
        this.containerEl = overlay
      }
      close(): void {
        if (this.containerEl?.parentNode) {
          this.containerEl.parentNode.removeChild(this.containerEl)
        }
        this.containerEl = null
      }
      hide(): void { this.close() }
    } as unknown as Record<string, unknown>
  }
  if (!window.obsidian.requestUrl) {
    window.obsidian.requestUrl = async (urlOrRequest: unknown) => {
      const url = typeof urlOrRequest === 'string' ? urlOrRequest : (urlOrRequest as { url: string }).url
      const reqOptions = typeof urlOrRequest === 'string' ? {} : urlOrRequest as { method?: string; headers?: Record<string, string>; body?: string; contentType?: string }
      const token = getStoredAuthToken() || ''
      const csrfToken = getStoredCsrfToken() || ''
      const proxyBody = {
        url,
        method: reqOptions.method || 'GET',
        headers: reqOptions.headers,
        body: reqOptions.body,
        contentType: reqOptions.contentType,
      }
      const proxyResponse = await fetch('/api/v1/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(proxyBody),
      })
      const data = await proxyResponse.json() as { status?: number; headers?: Record<string, string>; text?: string; arrayBuffer?: string; message?: string }
      if (!proxyResponse.ok) {
        throw new Error(data.message || 'Proxy request failed')
      }
      let text = ''
      if (data.text !== undefined) {
        text = data.text
      } else if (data.arrayBuffer) {
        const binary = atob(data.arrayBuffer)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i) }
        text = new TextDecoder().decode(bytes)
      }
      let json: unknown = null
      try { json = JSON.parse(text) } catch { /* not json */ }
      const arrayBuffer = new TextEncoder().encode(text).buffer
      return { status: data.status || 200, headers: data.headers || {}, text, json, arrayBuffer }
    }
  }

  // ViewState — type-like object export. Kanban imports { ViewState } from 'obsidian'.
  // It's just used as a TypeScript type, but the bundled code may reference it at runtime.
  if (!window.obsidian.ViewState) {
    window.obsidian.ViewState = {} as unknown as Record<string, unknown>
  }

  // ViewStateResult — used by setState(state, result) in TextFileView subclasses.
  if (!window.obsidian.ViewStateResult) {
    window.obsidian.ViewStateResult = {} as unknown as Record<string, unknown>
  }

  // HoverParent / HoverPopover — Kanban implements HoverParent interface.
  // These are just type markers; the shim provides empty objects.
  if (!window.obsidian.HoverParent) {
    window.obsidian.HoverParent = {} as unknown as Record<string, unknown>
  }
  if (!window.obsidian.HoverPopover) {
    window.obsidian.HoverPopover = class HoverPopover {
      hoverEl: HTMLElement = document.createElement('div')
      state: number = 0
      constructor() {}
      hide(): void {}
    } as unknown as Record<string, unknown>
  }

  // around() — monkey-patching utility used by Kanban.
  // Kanban bundles `monkey-around` which provides `around(obj, { method(next) { ... } })`.
  // If the bundled require fails, we provide a fallback on window.
  if (!(window as unknown as { around?: unknown }).around) {
    (window as unknown as { around: unknown }).around = function around(
      obj: Record<string, unknown>,
      factories: Record<string, (next: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown>,
    ): () => void {
      const originals: Record<string, unknown> = {}
      for (const [method, factory] of Object.entries(factories)) {
        originals[method] = obj[method]
        const original = obj[method] as (...args: unknown[]) => unknown
        obj[method] = factory(original)
      }
      // Return an uninstaller function
      return () => {
        for (const [method, original] of Object.entries(originals)) {
          obj[method] = original
        }
      }
    }
  }
  // ─── CodeMirror 6 stubs (used by Kanban inline editor, Tasks, etc.) ─────
  // Obsidian re-exports @codemirror/state and @codemirror/view.
  // Plugins that use CodeMirror extensions (StateField, EditorView, etc.) require these.
  // We provide REAL CM6 implementations so that plugins can register functional editor
  // extensions via registerEditorExtension(). The real modules are already in the Vite
  // bundle (used by CodeMirrorEditor), so this is zero additional bundle cost.
  if (!(window as unknown as { __codemirrorState?: unknown }).__codemirrorState) {
    ;(window as unknown as { __codemirrorState: Record<string, unknown> }).__codemirrorState = {
      ...CmState as unknown as Record<string, unknown>,
      // Stubs for exports not in @codemirror/state but expected by some plugins
      Transaction: CmState.Transaction ?? {},
      RangeValue: (CmState as unknown as Record<string, unknown>).RangeValue ?? class RangeValue { eq(_other: unknown): boolean { return false } },
      RangeSet: (CmState as unknown as Record<string, unknown>).RangeSet ?? { empty: {}, of: () => ({}) },
    }
  }
  if (!(window as unknown as { __codemirrorView?: unknown }).__codemirrorView) {
    ;(window as unknown as { __codemirrorView: Record<string, unknown> }).__codemirrorView = {
      ...CmView as unknown as Record<string, unknown>,
      // Stub for placeholder if not exported by the version we have
      placeholder: (CmView as unknown as Record<string, unknown>).placeholder ?? (() => ({})),
    }
  }
  if (!(window as unknown as { __codemirrorLanguage?: unknown }).__codemirrorLanguage) {
    ;(window as unknown as { __codemirrorLanguage: Record<string, unknown> }).__codemirrorLanguage = {
      ...CmLanguage as unknown as Record<string, unknown>,
      // Polyfill: tokenClassNodeProp was removed from @codemirror/language in v6.x
      // but Obsidian still exports it. Plugins like Dataview use it to read CSS classes
      // from syntax tree nodes. We provide the singleton instance from our polyfill module
      // which is also configured on the Markdown parser's NodeTypes.
      tokenClassNodeProp,
      // Override syntaxTree() with Obsidian-compatible version that adjusts InlineCode
      // node ranges to exclude backtick markers. In @codemirror/lang-markdown, InlineCode
      // nodes include the backticks in their from/to range. In Obsidian's parser, they
      // don't — the range covers only the content. Plugins like Dataview rely on this
      // by doing sliceString(node.from, node.to) and checking startsWith("=").
      syntaxTree: createObsidianCompatSyntaxTree(CmLanguage.syntaxTree),
    }
  }
  if (!(window as unknown as { __codemirrorCommands?: unknown }).__codemirrorCommands) {
    ;(window as unknown as { __codemirrorCommands: Record<string, unknown> }).__codemirrorCommands = {
      ...CmCommands as unknown as Record<string, unknown>,
    }
  }
  if (!(window as unknown as { __codemirrorAutocomplete?: unknown }).__codemirrorAutocomplete) {
    ;(window as unknown as { __codemirrorAutocomplete: Record<string, unknown> }).__codemirrorAutocomplete = {
      ...CmAutocomplete as unknown as Record<string, unknown>,
    }
  }
  if (!(window as unknown as { __codemirrorSearch?: unknown }).__codemirrorSearch) {
    ;(window as unknown as { __codemirrorSearch: Record<string, unknown> }).__codemirrorSearch = {
      ...CmSearch as unknown as Record<string, unknown>,
    }
  }
  if (!(window as unknown as { __codemirrorLint?: unknown }).__codemirrorLint) {
    ;(window as unknown as { __codemirrorLint: Record<string, unknown> }).__codemirrorLint = {
      ...CmLint as unknown as Record<string, unknown>,
    }
  }
  // @codemirror/history does not exist in CM6 — the package was folded into
  // @codemirror/commands during the CM6 beta. Plugins written against the old
  // module name get the real history API rather than an empty object.
  if (!(window as unknown as { __codemirrorHistory?: unknown }).__codemirrorHistory) {
    ;(window as unknown as { __codemirrorHistory: Record<string, unknown> }).__codemirrorHistory = {
      history: CmCommands.history,
      historyField: CmCommands.historyField,
      historyKeymap: CmCommands.historyKeymap,
      isolateHistory: CmCommands.isolateHistory,
      undo: CmCommands.undo,
      redo: CmCommands.redo,
      undoDepth: CmCommands.undoDepth,
      redoDepth: CmCommands.redoDepth,
      undoSelection: CmCommands.undoSelection,
      redoSelection: CmCommands.redoSelection,
    }
  }
  if (!(window as unknown as { __lezerHighlight?: unknown }).__lezerHighlight) {
    ;(window as unknown as { __lezerHighlight: Record<string, unknown> }).__lezerHighlight = {
      ...LezerHighlight as unknown as Record<string, unknown>,
    }
  }
  if (!(window as unknown as { __lezerCommon?: unknown }).__lezerCommon) {
    ;(window as unknown as { __lezerCommon: Record<string, unknown> }).__lezerCommon = {
      ...LezerCommon as unknown as Record<string, unknown>,
    }
  }
  if (!(window as unknown as { __lezerLr?: unknown }).__lezerLr) {
    ;(window as unknown as { __lezerLr: Record<string, unknown> }).__lezerLr = {
      ...LezerLr as unknown as Record<string, unknown>,
    }
  }

  // CodeMirror 5 legacy global — Templater uses `CodeMirror.defineMode()`
  if (!(window as unknown as { CodeMirror?: unknown }).CodeMirror) {
    ;(window as unknown as { CodeMirror: Record<string, unknown> }).CodeMirror = {
      defineMode: () => {},
      defineMIME: () => {},
      defineExtension: () => {},
      defineOption: () => {},
      registerHelper: () => {},
      registerGlobalHelper: () => {},
      modes: {},
      mimeModes: {},
      resolveMode: () => ({}),
      getMode: () => ({ token: () => null }),
      modeURL: '',
      Pass: {},
    }
  }

  // Also expose CM6 symbols directly on window.obsidian — Obsidian re-exports them
  // and many plugins import them via `const { StateField, EditorView } = require('obsidian')`
  const cmState = (window as unknown as { __codemirrorState: Record<string, unknown> }).__codemirrorState
  const cmView = (window as unknown as { __codemirrorView: Record<string, unknown> }).__codemirrorView
  const cmLang = (window as unknown as { __codemirrorLanguage: Record<string, unknown> }).__codemirrorLanguage
  const cmCommands = (window as unknown as { __codemirrorCommands: Record<string, unknown> }).__codemirrorCommands
  const cmAutocomplete = (window as unknown as { __codemirrorAutocomplete: Record<string, unknown> }).__codemirrorAutocomplete
  const cmSearchMod = (window as unknown as { __codemirrorSearch: Record<string, unknown> }).__codemirrorSearch
  const lezerHighlight = (window as unknown as { __lezerHighlight: Record<string, unknown> }).__lezerHighlight
  for (const [key, value] of Object.entries(cmState)) {
    if (!window.obsidian[key]) window.obsidian[key] = value
  }
  for (const [key, value] of Object.entries(cmView)) {
    if (!window.obsidian[key]) window.obsidian[key] = value
  }
  for (const [key, value] of Object.entries(cmLang)) {
    if (!window.obsidian[key]) window.obsidian[key] = value
  }
  for (const [key, value] of Object.entries(cmCommands)) {
    if (!window.obsidian[key]) window.obsidian[key] = value
  }
  for (const [key, value] of Object.entries(cmAutocomplete)) {
    if (!window.obsidian[key]) window.obsidian[key] = value
  }
  for (const [key, value] of Object.entries(cmSearchMod)) {
    if (!window.obsidian[key]) window.obsidian[key] = value
  }
  for (const [key, value] of Object.entries(lezerHighlight)) {
    if (!window.obsidian[key]) window.obsidian[key] = value
  }

  // Obsidian-specific StateFields that plugins access via require('obsidian')
  // These are NOT part of @codemirror/* packages — they are Obsidian's own additions.
  window.obsidian.editorInfoField = editorInfoField
  window.obsidian.editorEditorField = editorEditorField
  window.obsidian.editorLivePreviewField = editorLivePreviewField
  window.obsidian.editorViewField = editorViewField

  if (!(window as unknown as { __obsidianDailyNotesInterface?: unknown }).__obsidianDailyNotesInterface) {
    /**
     * Helper: get current daily-notes settings from the internalPlugins stub.
     * The `folder` field is updated dynamically by PluginProvider when vault config loads.
     */
    const getDailyNoteSettings = (): { format: string; folder: string; template: string } => {
      try {
        const app = (window as unknown as { app?: { internalPlugins?: { getPluginById?: (id: string) => { instance?: { options?: { format?: string; folder?: string; template?: string } } } | undefined } } }).app
        const plugin = app?.internalPlugins?.getPluginById?.('daily-notes')
        const opts = plugin?.instance?.options
        return {
          format: opts?.format || 'YYYY-MM-DD',
          folder: opts?.folder || '',
          template: opts?.template || '',
        }
      } catch {
        return { format: 'YYYY-MM-DD', folder: '', template: '' }
      }
    }

    /**
     * Helper: get the vault shim from window.app.
     */
    const getVault = (): { create: (path: string, content?: string) => Promise<unknown>; getMarkdownFiles: () => Array<{ path: string; name: string; basename: string; extension: string; stat: { mtime: number; ctime: number; size: number }; parent: unknown }> } | null => {
      try {
        const app = (window as unknown as { app?: { vault?: unknown } }).app
        return app?.vault as ReturnType<typeof getVault> ?? null
      } catch {
        return null
      }
    }

    /**
     * Helper: build a date UID string for a given moment date (day granularity).
     * Format: "day-YYYY-MM-DD"
     */
    const getDateUID = (date: { format: (fmt: string) => string }, granularity?: string): string => {
      const gran = granularity || 'day'
      return `${gran}-${date.format('YYYY-MM-DD')}`
    }

    (window as unknown as { __obsidianDailyNotesInterface: Record<string, unknown> }).__obsidianDailyNotesInterface = {
      getDailyNoteSettings,

      /**
       * getAllDailyNotes — scans vault for files matching the daily note pattern.
       * Returns Record<dateUID, TFile>.
       */
      getAllDailyNotes: (): Record<string, unknown> => {
        const vault = getVault()
        if (!vault) return {}

        const settings = getDailyNoteSettings()
        const format = settings.format || 'YYYY-MM-DD'
        const folder = settings.folder || ''
        const m = (window as unknown as { moment: typeof moment }).moment

        const result: Record<string, unknown> = {}
        const files = vault.getMarkdownFiles()

        for (const file of files) {
          // Check if file is in the daily notes folder
          if (folder) {
            if (!file.path.startsWith(folder + '/')) continue
          }
          // If no folder configured, scan all files (any depth).
          // This matches Obsidian's behavior where daily notes without a configured
          // folder can exist anywhere, and Calendar shows dots for all matching files.

          // Try to parse the basename as a date with the configured format
          const date = m(file.basename, format, true)
          if (date.isValid()) {
            const uid = getDateUID(date, 'day')
            result[uid] = file
          }
        }

        return result
      },

      /**
       * getDailyNote — finds an existing daily note for the given date.
       * @param date - A moment instance
       * @param allDailyNotes - Record from getAllDailyNotes()
       */
      getDailyNote: (date: { format: (fmt: string) => string }, allDailyNotes: Record<string, unknown>): unknown => {
        const uid = getDateUID(date, 'day')
        return allDailyNotes[uid] ?? null
      },

      /**
       * createDailyNote — creates a new daily note file for the given date.
       * @param date - A moment instance
       * @returns The created TFile
       */
      createDailyNote: async (date: { format: (fmt: string) => string }): Promise<unknown> => {
        const vault = getVault()
        if (!vault) {
          console.error('[obsidian-daily-notes-interface] No vault available')
          return null
        }

        const settings = getDailyNoteSettings()
        const format = settings.format || 'YYYY-MM-DD'
        const folder = settings.folder || ''
        const fileName = date.format(format) + '.md'
        const filePath = folder ? `${folder}/${fileName}` : fileName

        try {
          const tFile = await vault.create(filePath, '')
          return tFile
        } catch (err) {
          console.error('[obsidian-daily-notes-interface] Failed to create daily note:', err)
          return null
        }
      },

      /**
       * getDateFromFile — extracts a moment date from a TFile's basename.
       * @param file - A TFile object
       * @param granularity - 'day' | 'week' | 'month' (default: 'day')
       * @returns A moment instance or null
       */
      getDateFromFile: (file: { basename: string } | null, granularity?: string): unknown => {
        if (!file) return null
        const settings = getDailyNoteSettings()
        const format = settings.format || 'YYYY-MM-DD'
        const m = (window as unknown as { moment: typeof moment }).moment

        // Only support 'day' granularity for now
        if (granularity && granularity !== 'day') return null

        const date = m(file.basename, format, true)
        return date.isValid() ? date : null
      },

      getDateUID,
      appHasDailyNotesPluginLoaded: () => true,
    }
  }

  // ─── SuggestModal / FuzzySuggestModal ──────────────────────────────────────

  if (!window.obsidian.SuggestModal) {
    window.obsidian.SuggestModal = SuggestModal as unknown as Record<string, unknown>
    window.obsidian.FuzzySuggestModal = FuzzySuggestModal as unknown as Record<string, unknown>
  }

  // ─── MarkdownRenderer ──────────────────────────────────────────────────────

  if (!window.obsidian.MarkdownRenderer) {
    window.obsidian.MarkdownRenderer = MarkdownRenderer as unknown as Record<string, unknown>
  }

  // ─── Editor class stub ─────────────────────────────────────────────────────
  // Some plugins reference `obsidian.Editor` for type checks.

  if (!window.obsidian.Editor) {
    window.obsidian.Editor = EditorShim as unknown as Record<string, unknown>
  }

  // ─── Extended API Registration ─────────────────────────────────────────────
  // Register all additional Obsidian API extensions (icons, Events, Scope, Keymap,
  // DOM globals, utility functions, extra UI components, MarkdownPreviewRenderer).
  registerObsidianApiExtensions()

  // ─── Fallback Shims ────────────────────────────────────────────────────────
  // Last: fill any name still unclaimed above with a minimal fallback, so a
  // plugin reaching for an unimplemented API gets a no-op instead of a crash.
  // Must stay after every real registration — these only fill genuine gaps.
  registerFallbackShims()

  // ─── Diagnostics ───────────────────────────────────────────────────────────
  // Exposes window.__slatebasePluginApiGaps() so the APIs plugins reached for
  // but Slatebase does not emulate can be inspected instead of scrolling past
  // in the console.
  installApiGapInspector()
}
