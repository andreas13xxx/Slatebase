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
import { getCurrentPluginId, trackPluginTimer, withPluginContext } from './plugin-execution-context'
import { getBuiltInIconIds, getLucideIconElement, renderLucideIconInto } from './lucide-icons'
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
  livePreviewState,
} from '../../editor/editor-state-fields'

// NodeProp for tokenClassNodeProp polyfill (removed from @codemirror/language in v6.x)
import { tokenClassNodeProp } from '../../editor/token-class-node-prop'

// Load Obsidian-compatible CSS variables (maps Slatebase tokens to Obsidian naming)
import './obsidian-compat.css'
// Structural styling for the Obsidian component classes our shims render.
// After the variables above: it is written entirely in terms of them.
import './obsidian-components.css'

// Load global prototype extensions (Array, String, Math, Object, Element, Node)
// Must be before any plugin code evaluates — plugins use these directly.
import './global-extensions'

// Settings UI classes registered onto the namespace below. BaseComponent/
// ValueComponent/AbstractTextComponent live here too (not redefined inline)
// so `window.obsidian.BaseComponent` and the classes TextComponent/etc.
// actually extend are the exact same class — see the setting-tab.ts module
// doc for why that used to be two disconnected copies.
import {
  PluginSettingTab,
  Setting,
  BaseComponent,
  ValueComponent,
  AbstractTextComponent,
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
import { MarkdownRenderer } from './markdown-renderer'
import { EditorShim } from './editor-shim'
// Registered on the namespace under their Obsidian names, so plugin prototype
// patches and `instanceof` checks act on the classes actually in use.
import { WorkspaceShim } from './shims/workspace-shim'
import { MetadataCacheShim } from './shims/metadata-cache-shim'
import { VaultShim } from './shims/vault-shim'
import { FileManagerShim } from './shims/file-manager-shim'
import { registerObsidianApiExtensions, OBSIDIAN_API_VERSION, compareApiVersions, dispatchKeydownToScopeStack, Scope } from './obsidian-api-extensions'
import { registerFallbackShims } from './fallback-shims'
import { detectPlatform, readPlatformEnvironment } from './platform-detection'
import { installObsidianBodyClasses } from './body-classes'
import { installApiGapInspector } from './api-gap-registry'
import { warnNoOp, warnOnce } from './log'
import { isOwnedEventRef, offrefAtOwner } from './event-system'
import type { EventRef } from './types'
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


/** Result of {@link fuzzyMatchText} — used by the canonical FuzzySuggestModal below. */
interface FuzzyMatchResult<T> {
  item: T
  match: { score: number; matches: Array<[number, number]> }
}

/**
 * Gap-tolerant fuzzy match (query characters must appear in order in `text`,
 * not necessarily contiguously — the classic Ctrl+P / Cmd+P style match).
 * Lower score is better: penalizes gaps between matched characters, rewards
 * matches starting at a word boundary. Returns null if `query` doesn't match.
 */
function fuzzyMatchText(query: string, text: string): { score: number; matches: Array<[number, number]> } | null {
  if (query.length === 0) return { score: 0, matches: [] }
  if (query.length > text.length) return null

  const matches: Array<[number, number]> = []
  let queryIdx = 0
  let score = 0
  let lastMatchIdx = -1

  for (let i = 0; i < text.length && queryIdx < query.length; i++) {
    if (text[i] === query[queryIdx]) {
      const start = i
      while (i < text.length && queryIdx < query.length && text[i] === query[queryIdx]) {
        queryIdx++
        i++
      }
      i--
      matches.push([start, i])
      if (lastMatchIdx >= 0) score += start - lastMatchIdx - 1
      if (start === 0 || text[start - 1] === ' ' || text[start - 1] === '/' || text[start - 1] === '-' || text[start - 1] === '_') {
        score -= 2
      }
      lastMatchIdx = i
    }
  }

  if (queryIdx < query.length) return null
  return { score, matches }
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

  // theme-dark/theme-light and the platform mod-* classes. Before anything else:
  // plugin CSS and module-body theme checks both read them, and a plugin bundle
  // can run either the moment it is evaluated.
  installObsidianBodyClasses()

  // Keymap/Scope dispatch: inert until a plugin actually pushes a Scope (e.g. a
  // View's onOpen() calling `app.keymap.pushScope(this.scope)`), so this is safe
  // to register unconditionally alongside Slatebase's own key handling.
  window.addEventListener('keydown', dispatchKeydownToScopeStack)

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
  // Obsidian's window-aware `instanceOf` — plugins use `node.instanceOf(HTMLElement)`
  // instead of the native `instanceof` because Obsidian supports popout windows, where
  // an element's `HTMLElement` constructor belongs to a different realm than the main
  // window's (so a plain `instanceof` would wrongly say false). It resolves the
  // constructor by name on the node's own window first, falling back to the passed-in
  // type for same-window checks. Kanban calls this on every drag/resize/click target
  // (e.g. `t.instanceOf(HTMLElement)` in its resize observer), so without it those
  // handlers throw instead of running.
  if (!('instanceOf' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'instanceOf', {
      value: function (this: Node, type: { new (...args: unknown[]): unknown; name: string }): boolean {
        const win = (this as unknown as { win?: Window }).win ?? this.ownerDocument?.defaultView ?? window
        const winCtor = (win as unknown as Record<string, unknown>)[type.name] as (new (...args: unknown[]) => unknown) | undefined
        return this instanceof (winCtor ?? type)
      },
      writable: true, configurable: true,
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
      // Tag with the currently-executing plugin so CssInjector's [data-plugin-id]
      // ancestor scoping can still match — even when this element gets inserted
      // into shared workspace DOM (toolbars, popovers) instead of the plugin's
      // own view container, which has no such ancestor of its own.
      const pluginId = getCurrentPluginId()
      if (pluginId) el.setAttribute('data-plugin-id', pluginId)
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

  // Global setTimeout / setInterval — carry the plugin-execution-context across
  // the macrotask boundary. withPluginContext() only covers synchronous nesting,
  // so a plugin's bare `setTimeout(() => this.buildUI(), 100)` called from
  // onload() loses its plugin id by the time the callback actually fires: any
  // createEl()/createDiv() calls inside it come back untagged, and CssInjector's
  // [data-plugin-id] scoping silently fails to match, leaving unstyled DOM.
  // ("Editing Toolbar" builds its whole toolbar this way, which is how this was
  // found — its first, untagged attempt "wins" whenever the editor is already
  // mounted at onload time, since no later re-tagged event fires to replace it.)
  // Captures the currently-executing plugin at *scheduling* time and re-enters
  // that context when the deferred callback runs.
  const nativeSetTimeout = window.setTimeout.bind(window)
  const nativeSetInterval = window.setInterval.bind(window)
  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
    if (typeof handler !== 'function') return nativeSetTimeout(handler, timeout, ...args) as unknown as number
    const pluginId = getCurrentPluginId()
    const id = nativeSetTimeout(
      pluginId ? () => withPluginContext(pluginId, () => handler(...args)) : () => handler(...args),
      timeout
    ) as unknown as number
    // Let the sandbox cancel this on unload — otherwise a plugin's pending
    // timers (e.g. an autosave reset) keep firing after teardown, throwing on
    // whatever plugin state they still reference. See trackPluginTimer.
    if (pluginId) trackPluginTimer(pluginId, id)
    return id
  }) as typeof window.setTimeout
  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
    if (typeof handler !== 'function') return nativeSetInterval(handler, timeout, ...args) as unknown as number
    const pluginId = getCurrentPluginId()
    const id = nativeSetInterval(
      pluginId ? () => withPluginContext(pluginId, () => handler(...args)) : () => handler(...args),
      timeout
    ) as unknown as number
    if (pluginId) trackPluginTimer(pluginId, id)
    return id
  }) as typeof window.setInterval

  // requestAnimationFrame — same macrotask-boundary problem as setTimeout above.
  // Toolbar/positioning plugins commonly use rAF for layout/reposition loops.
  const nativeRAF = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    const pluginId = getCurrentPluginId()
    return nativeRAF(
      pluginId ? (time) => withPluginContext(pluginId, () => callback(time)) : callback
    )
  }) as typeof window.requestAnimationFrame

  // MutationObserver / ResizeObserver — likewise scheduled asynchronously, and
  // commonly used by plugins (e.g. "Editing Toolbar") to detect when the editor
  // DOM becomes available and (re)build UI in response. The observer is
  // constructed while plugin context is set (synchronously, during onload or an
  // event handler), but its callback fires later on its own schedule — same
  // context-loss shape as setTimeout, just via a different native API.
  if (typeof window.MutationObserver !== 'undefined') {
    const NativeMutationObserver = window.MutationObserver
    window.MutationObserver = class extends NativeMutationObserver {
      constructor(callback: MutationCallback) {
        const pluginId = getCurrentPluginId()
        super(pluginId
          ? (mutations, observer) => withPluginContext(pluginId, () => callback(mutations, observer))
          : callback)
      }
    }
  }
  if (typeof window.ResizeObserver !== 'undefined') {
    const NativeResizeObserver = window.ResizeObserver
    window.ResizeObserver = class extends NativeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        const pluginId = getCurrentPluginId()
        super(pluginId
          ? (entries, observer) => withPluginContext(pluginId, () => callback(entries, observer))
          : callback)
      }
    }
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
      return getLucideIconElement(iconId)
    }
  }
  if (!window.obsidian.getIconIds) {
    // Obsidian returns the built-in ids too, not just plugin-registered ones;
    // plugins list them to populate icon pickers.
    window.obsidian.getIconIds = (): string[] => {
      return [...customIconsRef.keys(), ...getBuiltInIconIds()]
    }
  }
  if (!window.obsidian.setIcon) {
    window.obsidian.setIcon = (parent: HTMLElement, iconId: string): void => {
      parent.innerHTML = ''
      const svg = customIconsRef.get(iconId)
      if (svg) { parent.innerHTML = svg; return }
      renderLucideIconInto(parent, iconId)
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

  // Obsidian exposes its manager classes on window.obsidian for two reasons:
  // plugins monkey-patch their prototypes (Templater patches
  // Workspace.getActiveViewOfType) and they narrow with `instanceof`.
  //
  // These used to be empty marker classes — `class Workspace {}` — which
  // satisfied `.prototype` access but nothing else: a prototype patch landed on
  // a class no live object descended from, and every `instanceof` was false.
  // Both failures are silent. Exporting the actual shim constructors makes the
  // patch reach the running instance and the type test answer correctly.
  if (!window.obsidian.Workspace) {
    window.obsidian.Workspace = WorkspaceShim as unknown as Record<string, unknown>
  }
  if (!window.obsidian.MetadataCache) {
    window.obsidian.MetadataCache = MetadataCacheShim as unknown as Record<string, unknown>
  }
  if (!window.obsidian.FileManager) {
    window.obsidian.FileManager = FileManagerShim as unknown as Record<string, unknown>
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
      private _eventRefs: EventRef[] = []

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
        // Deregister listeners handed to registerEvent()
        for (const ref of this._eventRefs) offrefAtOwner(ref)
        this._eventRefs = []
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
      /**
       * Hold an event subscription for the lifetime of this component.
       * Refs from a foreign emitter cannot be deregistered here, so they are
       * reported rather than dropped — the listener would survive unload.
       */
      registerEvent(ref: unknown): void {
        if (!ref || typeof ref !== 'object') return
        if (!isOwnedEventRef(ref)) {
          warnNoOp('Component', 'registerEvent', 'The event ref did not come from a Slatebase emitter and will not be deregistered on unload.')
          return
        }
        this._eventRefs.push(ref)
      }
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

  // PopoverSuggest — real Obsidian's shared base of EditorSuggest and
  // AbstractInputSuggest (Component -> PopoverSuggest -> {EditorSuggest,
  // AbstractInputSuggest}). Without this, both subclasses lacked
  // registerEvent/registerDomEvent/addChild/etc. (the same crash class as the
  // View/ItemView bug), and `instanceof PopoverSuggest` — which plugins use to
  // check "is this any kind of suggester" — was aliased to the unrelated
  // SuggestModal class.
  if (!window.obsidian.PopoverSuggest) {
    const ComponentClass = window.obsidian.Component as { new (): unknown; prototype: object }
    window.obsidian.PopoverSuggest = class PopoverSuggest<T> extends (ComponentClass as unknown as { new (): { load(): void; unload(): void; onload(): void; onunload(): void; register(cb: unknown): void; registerEvent(ref: unknown): void; registerDomEvent(el: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void; registerInterval(id: number): number; addChild<C>(c: C): C; removeChild<C>(c: C): C } }) {
      app: unknown
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
        super()
        this.app = app
        this.suggestEl = document.createElement('div')
        this.suggestEl.className = 'suggestion-container'
      }
      open(): void {}
      close(): void {}
      /** Render a suggestion item. Plugins override this. */
      renderSuggestion(_value: T, _el: HTMLElement): void {}
      /** Handle the user choosing a suggestion. Plugins override this. */
      selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent): void {}
    } as unknown as Record<string, unknown>
  }

  // EditorSuggest — Base class for autocomplete suggestions (Kanban DateSuggest/TimeSuggest).
  // Must be defined early — class heritage evaluates at bundle parse time.
  if (!window.obsidian.EditorSuggest) {
    const PopoverSuggestClass = window.obsidian.PopoverSuggest as { new (app: unknown): { app: unknown; suggestEl: HTMLElement; scope: unknown; open(): void; close(): void } }
    window.obsidian.EditorSuggest = class EditorSuggest<T> extends (PopoverSuggestClass as unknown as { new (app: unknown): { app: unknown; suggestEl: HTMLElement; scope: unknown; open(): void; close(): void } }) {
      context: unknown = null
      limit: number = 20
      constructor(app: unknown) {
        super(app)
      }
      getSuggestions(_context: unknown): T[] { return [] }
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
          // Obsidian's built-in Canvas core plugin — Slatebase has no canvas
          // feature, but Excalidraw's CanvasNodeFactory.initialize() (run from
          // its view's onLayoutReady handler, to support embedding files as
          // canvas nodes inside a drawing) unconditionally reaches into
          // `internalPlugins.plugins.canvas._loaded`/`.load()`/`.views.canvas(leaf)`
          // with no null check and no try/catch around the await. Without this
          // entry that access throws "canvas is undefined", which aborts the
          // rest of that onLayoutReady callback — including the statements
          // that add the `excalidraw-view` class and set up the toolbar's
          // sliding-panes/parent-move listeners — leaving the view half
          // initialized (drawing canvas visible, toolbar controls missing).
          // Stubbed enough to satisfy that call path; actual node embedding
          // through it is a no-op since there's no real canvas to render into.
          'canvas': {
            enabled: false,
            _loaded: true,
            load: () => {},
            views: {
              canvas: (_leaf: unknown) => ({
                canvas: {
                  createFileNode: (_opts: unknown) => ({
                    setFilePath: (_path: string, _subpath?: string) => {},
                    render: () => {},
                    containerEl: document.createElement('div'),
                  }),
                  removeNode: (_node: unknown) => {},
                  setReadonly: (_readonly: boolean) => {},
                },
              }),
            },
          },
        },
        getPluginById: (id: string) => {
          const plugins = ((window as unknown as { app: { internalPlugins: { plugins: Record<string, unknown> } } }).app.internalPlugins.plugins)
          return plugins[id] ?? { enabled: false, instance: { options: {} } }
        },
      },
      plugins: {
        plugins: {} as Record<string, unknown>,
        // Obsidian keys this by plugin id to the *manifest*, not the instance —
        // `app.plugins.manifests[id].version` is how plugins read each other's
        // versions. It was previously aliased to the instance map, where
        // `.version` is undefined (an instance carries `.manifest.version`).
        manifests: {} as Record<string, unknown>,
        enabledPlugins: new Set<string>(),
        getPlugin(id: string) {
          return (this as { plugins: Record<string, unknown> }).plugins[id]
        },
        registerPlugin(id: string, instance: unknown) {
          (this as { plugins: Record<string, unknown> }).plugins[id] = instance
          ;(this as { enabledPlugins: Set<string> }).enabledPlugins.add(id)
          const manifest = (instance as { manifest?: unknown } | null)?.manifest
          if (manifest) {
            (this as { manifests: Record<string, unknown> }).manifests[id] = manifest
          }
        },
        unregisterPlugin(id: string) {
          delete (this as { plugins: Record<string, unknown> }).plugins[id]
          delete (this as { manifests: Record<string, unknown> }).manifests[id]
          ;(this as { enabledPlugins: Set<string> }).enabledPlugins.delete(id)
        },
      },
      vault: {},
      workspace: {},
      metadataCache: {},
      foldManager: { save: () => {}, load: () => {}, getFolds: () => [] },
      // See AppShim.getAccentColor() for why this exists — kept in sync here
      // so views opened via createFileView's `sharedApp` (which reads through
      // window.app rather than owning its own AppShim) get the same method.
      getAccentColor: (): string => {
        const value = getComputedStyle(document.documentElement).getPropertyValue('--interactive-accent').trim()
        return value || '#7c3aed'
      },
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
        // See the matching comment on the global createEl() above — same
        // reasoning, this is the `containerEl.createEl(...)` entry point.
        const pluginId = getCurrentPluginId()
        if (pluginId) el.setAttribute('data-plugin-id', pluginId)
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
  // The constructor receives the app instance from the PluginLoader.
  // Real Obsidian: Plugin extends Component. It used to reimplement Component's
  // entire lifecycle (load/unload/addChild/register*) by hand instead of
  // inheriting it — near-identical code kept in two places, which is exactly
  // how the View/ItemView Component bug happened (a fix applied to one was
  // never applied to the other). Extending Component here means there is only
  // one lifecycle implementation to fix or extend going forward.
  if (!window.obsidian.Plugin) {
    const ComponentClass = window.obsidian.Component as { new (): { load(): void; unload(): void; onload(): void; onunload(): void; addChild<T>(c: T): T; removeChild<T>(c: T): T; register(cb: unknown): void; registerEvent(ref: unknown): void; registerInterval(id: number): number; registerDomEvent(el: EventTarget, event: string, handler: EventListenerOrEventListenerObject): void } }
    window.obsidian.Plugin = class Plugin extends ComponentClass {
      app: unknown
      manifest: unknown
      /** Scope — Obsidian's keymap manager for plugin hotkeys */
      scope = {
        keys: function(..._args: unknown[]) { return { scope: this } },
        register: (_modifiers: string[], _key: string | null, _callback: () => boolean | void) => ({ scope: null }),
        unregister: (_handler: unknown) => {},
      }
      // Obsidian's signature is `constructor(app, manifest)`. The manifest must
      // be in place before the subclass body runs: esbuild lowers class fields
      // into the constructor, so `foo = this.manifest.version` in a plugin's
      // class body reads it here — assigning it only after construction (as the
      // loader used to) left those fields undefined for good.
      constructor(app: unknown, manifest?: unknown) {
        super()
        this.app = app
        this.manifest = manifest ?? {}
      }
      async loadData(): Promise<unknown> { return null }

      async saveData(_data: unknown): Promise<void> {}

      addCommand(_cmd: unknown): void {}

      addSettingTab(_tab: unknown): void {}

      registerView(_viewType: string, _creator: unknown): void {}
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
      /**
       * Register an `obsidian://` protocol handler. Deliberately unsupported:
       * Slatebase is a web app and cannot claim a custom URL scheme.
       */
      registerObsidianProtocolHandler(action: string, _handler: unknown): void {
        const pluginId = (this.manifest as { id?: string })?.id ?? 'unknown'
        warnNoOp(pluginId, 'registerObsidianProtocolHandler', `Slatebase is a web app and cannot handle obsidian://${action} links.`)
      }
      /** Remove a previously registered command. Wired to the CommandRegistry per instance. */
      removeCommand(_commandId: string): void {
        const pluginId = (this.manifest as { id?: string })?.id ?? 'unknown'
        warnNoOp(pluginId, 'removeCommand', 'The command stays in the command palette.')
      }
      /**
       * Register a CLI handler. Deliberately unsupported: there is no Slatebase
       * desktop CLI for a plugin to extend.
       */
      registerCliHandler(command: string, _description: string, _flags: unknown, _handler: unknown): void {
        const pluginId = (this.manifest as { id?: string })?.id ?? 'unknown'
        warnNoOp(pluginId, 'registerCliHandler', `Slatebase has no CLI, so "${command}" is unreachable.`)
      }
    } as unknown as Record<string, unknown>
  }

  window.obsidian.PluginSettingTab = PluginSettingTab
  window.obsidian.Setting = Setting
  // SettingTab — base class (PluginSettingTab extends it in Obsidian)
  if (!window.obsidian.SettingTab) {
    window.obsidian.SettingTab = PluginSettingTab
  }

  // BaseComponent — abstract base for all setting UI components.
  // Excalidraw extends this for custom settings controls. Defined in
  // setting-tab.ts (imported above) — TextComponent/ToggleComponent/etc. all
  // extend that exact same class, so this is the same object plugins see via
  // `instanceof BaseComponent`, not a second copy.
  if (!window.obsidian.BaseComponent) {
    window.obsidian.BaseComponent = BaseComponent as unknown as Record<string, unknown>
  }

  // ValueComponent — extends BaseComponent with get/set value pattern.
  if (!window.obsidian.ValueComponent) {
    window.obsidian.ValueComponent = ValueComponent as unknown as Record<string, unknown>
  }

  // AbstractTextComponent — shared base of TextComponent/TextAreaComponent.
  if (!window.obsidian.AbstractTextComponent) {
    window.obsidian.AbstractTextComponent = AbstractTextComponent as unknown as Record<string, unknown>
  }

  window.obsidian.TextComponent = TextComponent
  window.obsidian.TextAreaComponent = TextAreaComponent
  window.obsidian.ToggleComponent = ToggleComponent
  window.obsidian.DropdownComponent = DropdownComponent
  window.obsidian.ButtonComponent = ButtonComponent
  window.obsidian.SliderComponent = SliderComponent

  // FileSystemAdapter — exists for `instanceof` checks, not for use.
  // LiveSync uses `vault.adapter instanceof FileSystemAdapter` to detect desktop.
  //
  // The adapter a plugin actually receives is `vault.adapter` (vault-adapter-shim),
  // which is backed by the real vault. This class is what a plugin gets if it
  // constructs one itself, and it is disconnected from any storage: every method
  // is a stub. Reads returning empty and writes discarding data are equally
  // dangerous silently, so both warn — a plugin down this path is broken either
  // way, and the warning is the only trace of why.
  if (!window.obsidian.FileSystemAdapter) {
    const detachedAdapter = (method: string): void => {
      warnNoOp('FileSystemAdapter', method, 'This adapter is a bare `instanceof` stub with no vault behind it — use `vault.adapter` instead.')
    }
    window.obsidian.FileSystemAdapter = class FileSystemAdapter {
      getName(): string { return 'slatebase' }
      getBasePath(): string { return '/' }
      getFullPath(path: string): string { return path }
      getFilePath(path: string): string { return path }
      getResourcePath(path: string): string { return path }
      async exists(_path: string): Promise<boolean> { detachedAdapter('exists'); return false }
      async stat(_path: string): Promise<unknown> { detachedAdapter('stat'); return null }
      async list(_path: string): Promise<{ files: string[]; folders: string[] }> { detachedAdapter('list'); return { files: [], folders: [] } }
      async read(_path: string): Promise<string> { detachedAdapter('read'); return '' }
      async readBinary(_path: string): Promise<ArrayBuffer> { detachedAdapter('readBinary'); return new ArrayBuffer(0) }
      async write(_path: string, _data: string): Promise<void> { detachedAdapter('write') }
      async writeBinary(_path: string, _data: ArrayBuffer): Promise<void> { detachedAdapter('writeBinary') }
      async append(_path: string, _data: string): Promise<void> { detachedAdapter('append') }
      async remove(_path: string): Promise<void> { detachedAdapter('remove') }
      async rename(_path: string, _newPath: string): Promise<void> { detachedAdapter('rename') }
      async copy(_path: string, _newPath: string): Promise<void> { detachedAdapter('copy') }
      async mkdir(_path: string): Promise<void> { detachedAdapter('mkdir') }
      async rmdir(_path: string, _recursive: boolean): Promise<void> { detachedAdapter('rmdir') }
      async trashSystem(_path: string): Promise<boolean> { detachedAdapter('trashSystem'); return false }
      async trashLocal(_path: string): Promise<void> { detachedAdapter('trashLocal') }
      async process(_path: string, fn: (data: string) => string): Promise<string> { detachedAdapter('process'); return fn('') }
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
    ): T & { cancel: () => void; run: () => ReturnType<T> | void } => {
      let timerId: ReturnType<typeof setTimeout> | null = null
      let lastArgs: unknown[] | null = null
      const debounced = (...args: unknown[]) => {
        lastArgs = args
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
      /** Force-fire a pending call immediately (Obsidian 1.4.4+ Debouncer.run()). */
      debounced.run = (): ReturnType<T> | void => {
        if (timerId === null || lastArgs === null) return
        clearTimeout(timerId)
        timerId = null
        return fn(...lastArgs) as ReturnType<T>
      }
      return debounced as unknown as T & { cancel: () => void; run: () => ReturnType<T> | void }
    }
  }

  // TAbstractFile — the shared base of TFile and TFolder. Plugins narrow with
  // `instanceof TAbstractFile` when a value could be either (Vault.on('rename')
  // hands one out), so TFile/TFolder below must extend it, not stand alone.
  if (!window.obsidian.TAbstractFile) {
    window.obsidian.TAbstractFile = class TAbstractFile {
      path = ''
      name = ''
      parent: unknown = null
      vault: unknown = null
    } as unknown as Record<string, unknown>
  }
  const TAbstractFileClass = window.obsidian.TAbstractFile as unknown as {
    new (): { path: string; name: string; parent: unknown; vault: unknown }
  }

  // TFile class stub — some plugins use `instanceof obsidian.TFile`
  if (!window.obsidian.TFile) {
    window.obsidian.TFile = class TFile extends TAbstractFileClass {
      basename = ''
      extension = ''
      stat = { mtime: 0, ctime: 0, size: 0 }
    } as unknown as Record<string, unknown>
  }

  // TFolder class stub — some plugins use `instanceof obsidian.TFolder`
  if (!window.obsidian.TFolder) {
    window.obsidian.TFolder = class TFolder extends TAbstractFileClass {
      children: unknown[] = []
      isRoot() { return this.path === '' || this.path === '/' }
    } as unknown as Record<string, unknown>
  }

  // Vault static methods — some plugins use `Vault.recurseChildren(folder, cb)`
  if (!window.obsidian.Vault) {
    // The real shim class, so `file.vault instanceof Vault` holds and prototype
    // patches reach the live instance; the statics below hang off it as in
    // Obsidian, where Vault is a class with static helpers.
    window.obsidian.Vault = VaultShim as unknown as Record<string, unknown>
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

  // View — the abstract base every view type derives from. Exported because
  // plugins type-test against it (`leaf.view instanceof View`) and because
  // `MarkdownView extends View` is what makes those tests hold for our views.
  // Extends Component (real Obsidian: Component -> View -> ItemView) so that
  // registerDomEvent/registerInterval/addChild/removeChild/load/unload reach
  // ItemView and its subclasses — plugins call these from onload(), which our
  // WorkspaceLeaf now invokes as part of the view lifecycle (see view-registry.ts).
  if (!window.obsidian.View) {
    const ComponentClass = window.obsidian.Component as { new (): unknown; prototype: object }
    window.obsidian.View = class View extends (ComponentClass as unknown as { new (): object }) {} as unknown as Record<string, unknown>
  }
  const ViewClass = window.obsidian.View as unknown as { new (): object }

  // ItemView — base class for custom plugin views (Calendar, Kanban, etc.)
  if (!window.obsidian.ItemView) {
    window.obsidian.ItemView = class ItemView extends ViewClass {
      containerEl: HTMLElement
      contentEl: HTMLElement
      app: unknown
      leaf: unknown
      constructor(leaf: unknown) {
        super()
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
      // registerEvent/register/registerDomEvent/registerInterval/addChild/removeChild/
      // load/unload/onload/onunload are inherited from Component via View — see above.
      /** Add a clickable action icon to the view header. */
      addAction(icon: string, title: string, callback: () => void): HTMLElement {
        // Create or find the header actions container
        let actionsEl = this.containerEl.querySelector('.view-actions') as HTMLElement | null
        if (!actionsEl) {
          actionsEl = document.createElement('div')
          actionsEl.className = 'view-actions'
          this.containerEl.insertBefore(actionsEl, this.contentEl)
        }

        const button = document.createElement('button')
        button.className = 'view-action'
        button.setAttribute('aria-label', title)
        button.title = title
        button.addEventListener('click', callback)
        actionsEl.appendChild(button)

        // Render icon: custom icon registry first, then Lucide
        const customIcons = (window as unknown as { __obsidianCustomIcons?: Map<string, string> }).__obsidianCustomIcons
        const customSvg = customIcons?.get(icon)
        if (customSvg) {
          button.innerHTML = customSvg
        } else {
          renderLucideIconInto(button, icon)
        }

        return button
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
      private _cleanups: Array<() => void> = []
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
        this.runCleanups()
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
      /**
       * Register a cleanup callback, run when the view closes.
       *
       * Was a no-op, which is the silent-failure case Obsidian's Component
       * contract makes expensive: plugins hand `register()` their event
       * unsubscribes and interval clears and never track them separately, so
       * dropping the callback leaks a listener per view open.
       */
      register(cb: unknown): void {
        if (typeof cb === 'function') this._cleanups.push(cb as () => void)
      }
      /** Run and drop every registered cleanup. One throwing must not skip the rest. */
      private runCleanups(): void {
        const cleanups = this._cleanups.splice(0)
        for (const cb of cleanups) {
          try {
            cb()
          } catch (err) {
            console.error('[PluginCompat] TextFileView cleanup callback threw', err)
          }
        }
      }
    } as unknown as Record<string, unknown>
  }

  // MarkdownView — plugins use `getActiveViewOfType(MarkdownView)` to check if the
  // active leaf is editing a markdown file. Extends FileView with editor property.
  // This is the ONE canonical MarkdownView (Component -> View -> ItemView -> FileView
  // -> MarkdownView chain) — WorkspaceShim.getActiveViewOfType() constructs instances
  // of this exact class rather than a separate lookalike, so `instanceof MarkdownView`
  // and inherited Component methods (registerEvent/registerDomEvent/addChild/...) work
  // regardless of whether a plugin got the view from `activeLeaf.view` or by querying.
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
      /** Preview-mode stub (Live Preview only — no separate reading-mode renderer). */
      previewMode: { rerender: () => void } = { rerender: () => {} }
      /** Sub-view mode stub (source/preview toggle plugins may probe). */
      currentMode: { get: () => string; set: (data: string, clear: boolean) => void } = {
        get: () => 'source',
        set: () => {},
      }
      /** Get the raw view data — delegates to the live editor. */
      getViewData(): string {
        return (this.editor as { getValue: () => string } | null)?.getValue() ?? ''
      }
      /** Set the view data — delegates to the live editor. */
      setViewData(data: string, _clear?: boolean): void {
        (this.editor as { setValue: (v: string) => void } | null)?.setValue(data)
      }
      /** Clear the view state. No-op — Slatebase re-renders from the editor directly. */
      clear(): void { /* no-op */ }
      /** Show the search bar. No-op — Slatebase has its own search panel. */
      showSearch(_replace?: boolean): void { /* no-op */ }
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
  // Modal — the ONE canonical Modal implementation. SuggestModal/FuzzySuggestModal
  // (below) and ConfirmationModal both extend THIS class — there used to be two
  // independent Modal implementations (this one, and a second one in
  // shims/suggest-modal-shim.ts that unconditionally overwrote this one after
  // install, orphaning ConfirmationModal's `extends` binding). `instanceof Modal`
  // and shared behavior fixes now apply consistently everywhere.
  if (!window.obsidian.Modal) {
    window.obsidian.Modal = class Modal {
      app: unknown
      containerEl: HTMLElement
      modalEl: HTMLElement
      titleEl: HTMLElement
      contentEl: HTMLElement
      readonly scope: Scope = new Scope()
      /** Whether to restore the previous text selection on close (real Obsidian field; cosmetic here). */
      shouldRestoreSelection: boolean = true
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
        this.overlayEl.addEventListener('mousedown', (e) => {
          if (e.target === this.overlayEl) this.close()
        })
        // Close on Escape
        this.overlayEl.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { e.preventDefault(); this.close() }
        })
        document.body.appendChild(this.overlayEl)
        // Real Obsidian pushes the modal's own scope while it's open, so hotkeys
        // plugins register on `this.scope` (e.g. a suggest modal's Mod+Enter) fire
        // — Escape/backdrop-close above are wired separately and unaffected.
        ;(this.app as { keymap?: { pushScope: (s: Scope) => void } } | undefined)?.keymap?.pushScope(this.scope)
        try {
          this.onOpen()
        } catch (err: unknown) {
          // Show the error inside the modal so developers can see what API is missing
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error('[Modal.open] onOpen() threw:', err)
          this.contentEl.innerHTML = `<div style="color:var(--text-error,#e53935);padding:12px;font-size:13px;"><strong>Modal-Fehler:</strong> ${errMsg}</div>`
        }
        // Focus the first focusable element so Escape/Tab work without a click first.
        const focusable = this.modalEl.querySelector('input, button, [tabindex]') as HTMLElement | null
        focusable?.focus()
      }
      close() {
        (this.app as { keymap?: { popScope: (s: Scope) => void } } | undefined)?.keymap?.popScope(this.scope)
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

  // requireApiVersion — plugins call this to check Obsidian API version
  // compatibility, then branch on the answer.
  //
  // This used to return true unconditionally, which is the worst of both worlds:
  // the plugin skips the fallback path it wrote for older Obsidian and calls an
  // API we never implemented, crashing somewhere unrelated. Answering against
  // the version we actually claim sends it down the path we can support.
  if (!window.obsidian.apiVersion) {
    window.obsidian.apiVersion = OBSIDIAN_API_VERSION
  }
  if (!window.obsidian.requireApiVersion) {
    window.obsidian.requireApiVersion = (version: string): boolean => {
      const satisfied = compareApiVersions(OBSIDIAN_API_VERSION, version) >= 0
      if (!satisfied) {
        warnOnce(
          `requireApiVersion::${version}`,
          `[PluginCompat] A plugin asked for Obsidian API >= ${version}; Slatebase implements ${OBSIDIAN_API_VERSION}, ` +
            `so it will take its older-version fallback path.`,
        )
      }
      return satisfied
    }
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
    /**
     * A menu entry. `kind` distinguishes real items from separators so both can
     * live in one ordered list — Obsidian's `addSeparator()` position matters,
     * and keeping separators in a side channel loses it.
     */
    interface MenuEntry {
      kind: 'item' | 'separator'
      title: string
      icon: string
      section: string
      checked: boolean
      disabled: boolean
      submenu: MenuInstance | null
      callback: (evt: MouseEvent | KeyboardEvent) => void
    }
    interface MenuInstance {
      items: MenuEntry[]
      close(): void
    }

    window.obsidian.Menu = class Menu {
      items: MenuEntry[] = []
      /** Obsidian exposes the menu element as `dom`; plugins style and measure it. */
      dom: HTMLElement | null = null
      containerEl: HTMLElement | null = null
      private onHideCallbacks: Array<() => void> = []
      private submenuEl: HTMLElement | null = null
      private noIcon = false

      addItem(cb: (item: unknown) => void): this {
        const item = Menu._createEntry('item')
        cb(item)
        this.items.push(item)
        return this
      }

      addSeparator(): this {
        this.items.push(Menu._createEntry('separator'))
        return this
      }

      /** Obsidian's opt-out of the icon gutter, for menus where no item has one. */
      setNoIcon(): this {
        this.noIcon = true
        return this
      }

      /** Register a callback for when the menu closes, by click or dismissal. */
      onHide(cb: () => void): this {
        this.onHideCallbacks.push(cb)
        return this
      }

      /** @internal Create a menu entry with all methods Obsidian plugins expect. */
      static _createEntry(kind: 'item' | 'separator'): MenuEntry & Record<string, unknown> {
        const entry = {
          kind,
          title: '', icon: '', section: '', checked: false, disabled: false,
          submenu: null as MenuInstance | null,
          callback: (_evt: MouseEvent | KeyboardEvent) => {},
          setTitle(t: string | DocumentFragment) {
            // Obsidian accepts a DocumentFragment for rich titles; flatten it,
            // since our renderer sets textContent.
            this.title = typeof t === 'string' ? t : (t.textContent ?? '')
            return this
          },
          setIcon(i: string | null) { this.icon = i ?? ''; return this },
          setSection(s: string) { this.section = s; return this },
          setChecked(c: boolean | null) { this.checked = c === true; return this },
          setDisabled(d: boolean) { this.disabled = d !== false; return this },
          setIsLabel(isLabel: boolean) { this.disabled = isLabel !== false; return this },
          onClick(fn: (evt: MouseEvent | KeyboardEvent) => void) { this.callback = fn; return this },
          setSubmenu(cb?: unknown) {
            // Obsidian API: setSubmenu() returns a new Menu (no-arg overload)
            // OR setSubmenu(cb) calls cb with a new Menu (callback overload)
            const submenu = new Menu()
            this.submenu = submenu as unknown as MenuInstance
            if (typeof cb === 'function') {
              ;(cb as (m: unknown) => void)(submenu)
              return this
            }
            // No-arg: return the submenu directly (Kanban uses this pattern)
            return submenu
          },
        }
        return entry as unknown as MenuEntry & Record<string, unknown>
      }

      showAtMouseEvent(evt: MouseEvent): this {
        this.show(evt.clientX, evt.clientY)
        return this
      }

      showAtPosition(pos: { x: number; y: number }): this {
        this.show(pos.x, pos.y)
        return this
      }

      /**
       * Build and mount the menu.
       *
       * Everything visual is left to the `.menu`/`.menu-item` classes in
       * obsidian-compat.css so plugin and theme CSS can restyle menus the way it
       * does in Obsidian; only the caller-supplied position is set inline.
       */
      private show(x: number, y: number): void {
        this.close()
        const overlay = document.createElement('div')
        overlay.className = 'menu-overlay'

        const menu = document.createElement('div')
        menu.className = this.noIcon ? 'menu mod-no-icon' : 'menu'
        // Grouping by section is what keeps plugin-contributed entries together
        // in the order the plugin declared the sections, as Obsidian does.
        for (const entry of this.sortedBySection()) {
          menu.appendChild(this.renderEntry(entry))
        }

        overlay.appendChild(menu)
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.close() })
        document.body.appendChild(overlay)
        this.containerEl = overlay
        this.dom = menu

        this.positionAt(menu, x, y)
        this.attachKeyboardNavigation(menu)
        menu.focus()
      }

      /** Entries grouped by `section`, sections in first-seen order. */
      private sortedBySection(): MenuEntry[] {
        const sections: string[] = []
        for (const entry of this.items) {
          if (!sections.includes(entry.section)) sections.push(entry.section)
        }
        if (sections.length <= 1) return this.items
        return sections.flatMap((section, i) => {
          const entries = this.items.filter((e) => e.section === section)
          // A divider between sections, unless the plugin already placed one.
          if (i > 0 && entries[0]?.kind !== 'separator') {
            return [Menu._createEntry('separator'), ...entries]
          }
          return entries
        })
      }

      /** Build the DOM for one entry, matching Obsidian's menu-item structure. */
      private renderEntry(entry: MenuEntry): HTMLElement {
        if (entry.kind === 'separator') {
          const sep = document.createElement('div')
          sep.className = 'menu-separator'
          return sep
        }

        const el = document.createElement('div')
        el.className = 'menu-item'
        if (entry.disabled) el.classList.add('is-disabled')
        if (entry.checked) el.classList.add('is-checked')
        if (entry.submenu) el.classList.add('mod-submenu')

        const iconEl = document.createElement('div')
        iconEl.className = 'menu-item-icon'
        if (entry.icon) renderLucideIconInto(iconEl, entry.icon)
        el.appendChild(iconEl)

        const titleEl = document.createElement('div')
        titleEl.className = 'menu-item-title'
        titleEl.textContent = entry.title
        el.appendChild(titleEl)

        if (entry.submenu) {
          const arrow = document.createElement('div')
          arrow.className = 'menu-item-icon mod-submenu-arrow'
          renderLucideIconInto(arrow, 'chevron-right')
          el.appendChild(arrow)
          el.addEventListener('mouseenter', () => { this.openSubmenu(entry, el) })
        } else {
          el.addEventListener('mouseenter', () => { this.closeSubmenu() })
        }

        if (entry.disabled) {
          // A disabled item that still fires its callback is worse than one that
          // does nothing, so swallow the event rather than only greying it out.
          el.setAttribute('aria-disabled', 'true')
          el.addEventListener('click', (e) => { e.stopPropagation() })
        } else {
          el.setAttribute('tabindex', '0')
          el.addEventListener('click', (e) => { this.invoke(entry, e) })
        }
        return el
      }

      private invoke(entry: MenuEntry, evt: MouseEvent | KeyboardEvent): void {
        // Close first: a callback that opens a modal must not leave the menu
        // floating above it.
        this.close()
        try {
          entry.callback(evt)
        } catch (err) {
          console.error('[PluginCompat] Menu item callback threw', entry.title, err)
        }
      }

      private openSubmenu(entry: MenuEntry, anchor: HTMLElement): void {
        this.closeSubmenu()
        const submenu = entry.submenu as unknown as Menu | null
        if (!submenu || !this.containerEl) return
        const rect = anchor.getBoundingClientRect()
        submenu.show(rect.right, rect.top)
        this.submenuEl = submenu.containerEl
      }

      private closeSubmenu(): void {
        this.submenuEl?.remove()
        this.submenuEl = null
      }

      /**
       * Clamp the menu inside the viewport.
       *
       * Menus are opened at the pointer, so one raised near the right or bottom
       * edge would otherwise extend past it and have its last items unreachable.
       */
      private positionAt(menu: HTMLElement, x: number, y: number): void {
        menu.style.left = `${x}px`
        menu.style.top = `${y}px`
        const rect = menu.getBoundingClientRect()
        const margin = 4
        if (rect.right > window.innerWidth) {
          menu.style.left = `${Math.max(margin, window.innerWidth - rect.width - margin)}px`
        }
        if (rect.bottom > window.innerHeight) {
          menu.style.top = `${Math.max(margin, window.innerHeight - rect.height - margin)}px`
        }
      }

      /** Arrow-key/Enter/Escape handling, as Obsidian's menus support. */
      private attachKeyboardNavigation(menu: HTMLElement): void {
        menu.setAttribute('tabindex', '-1')
        menu.addEventListener('keydown', (evt: KeyboardEvent) => {
          const selectable = [...menu.querySelectorAll<HTMLElement>('.menu-item:not(.is-disabled)')]
          if (selectable.length === 0) return
          const current = selectable.findIndex((el) => el === document.activeElement)
          if (evt.key === 'Escape') {
            evt.preventDefault()
            this.close()
          } else if (evt.key === 'ArrowDown') {
            evt.preventDefault()
            selectable[(current + 1) % selectable.length]?.focus()
          } else if (evt.key === 'ArrowUp') {
            evt.preventDefault()
            selectable[(current - 1 + selectable.length) % selectable.length]?.focus()
          } else if (evt.key === 'Enter' || evt.key === ' ') {
            if (current >= 0) {
              evt.preventDefault()
              selectable[current]?.click()
            }
          }
        })
      }

      close(): void {
        this.closeSubmenu()
        if (!this.containerEl) return
        this.containerEl.remove()
        this.containerEl = null
        this.dom = null
        for (const cb of this.onHideCallbacks) {
          try {
            cb()
          } catch (err) {
            console.error('[PluginCompat] Menu onHide callback threw', err)
          }
        }
      }

      hide(): this { this.close(); return this }
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
  window.obsidian.livePreviewState = livePreviewState

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

    /** A minimal TFile shape, as returned by vault.getMarkdownFiles() / getAbstractFileByPath(). */
    type DailyNotesTFile = { path: string; name: string; basename: string; extension: string; stat: { mtime: number; ctime: number; size: number }; parent: unknown }

    /**
     * Helper: get the vault shim from window.app.
     */
    const getVault = (): {
      create: (path: string, content?: string) => Promise<unknown>
      getMarkdownFiles: () => Array<DailyNotesTFile>
      read: (file: DailyNotesTFile) => Promise<string>
    } | null => {
      try {
        const app = (window as unknown as { app?: { vault?: unknown } }).app
        return app?.vault as ReturnType<typeof getVault> ?? null
      } catch {
        return null
      }
    }

    /**
     * Helper: resolve the configured daily-note template file, if any.
     * Mirrors dailyNoteService.ts's placeholder substitution so both note-creation
     * paths (native UI and community plugins like Calendar) produce identical content.
     */
    const readDailyNoteTemplate = async (templatePath: string, date: { format: (fmt: string) => string }): Promise<string> => {
      if (!templatePath.trim()) return ''
      try {
        const app = (window as unknown as { app?: { metadataCache?: { getFirstLinkpathDest: (linkpath: string, sourcePath: string) => DailyNotesTFile | null } } }).app
        const templateFile = app?.metadataCache?.getFirstLinkpathDest?.(templatePath, '')
        if (!templateFile) return ''

        const vault = getVault()
        if (!vault) return ''
        const raw = await vault.read(templateFile)

        const now = new Date()
        const dateStr = date.format('YYYY-MM-DD')
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

        return raw
          .replace(/\{\{date\}\}/g, dateStr)
          .replace(/\{\{time\}\}/g, timeStr)
          .replace(/\{\{title\}\}/g, dateStr)
      } catch {
        return ''
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
        const content = await readDailyNoteTemplate(settings.template, date)

        try {
          const tFile = await vault.create(filePath, content)
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
  // Extend the canonical Modal above (not a second, disconnected one) so
  // `instanceof Modal` holds and Escape/backdrop-close behavior is shared.
  if (!window.obsidian.SuggestModal) {
    const ModalClass = window.obsidian.Modal as { new (app: unknown): unknown; prototype: object }
    type ModalInstance = { app: unknown; containerEl: HTMLElement; modalEl: HTMLElement; contentEl: HTMLElement; open(): void; close(): void; onOpen(): void; onClose(): void }
    window.obsidian.SuggestModal = class SuggestModal<T> extends (ModalClass as unknown as { new (app: unknown): ModalInstance }) {
      limit = 100
      emptyStateText = 'No results found.'
      inputEl: HTMLInputElement
      resultContainerEl: HTMLElement
      private suggestions: T[] = []
      private selectedIndex = 0

      constructor(app: unknown) {
        super(app)
        this.inputEl = document.createElement('input')
        this.inputEl.type = 'text'
        this.inputEl.className = 'prompt-input'
        this.inputEl.style.cssText = 'width:100%;padding:8px 12px;border:1px solid var(--border-color,#ddd);border-radius:4px;font-size:14px;margin-bottom:8px;outline:none;box-sizing:border-box;'
        this.inputEl.placeholder = 'Type to search...'

        this.resultContainerEl = document.createElement('div')
        this.resultContainerEl.className = 'prompt-results'
        this.resultContainerEl.style.cssText = 'max-height:300px;overflow-y:auto;'

        this.modalEl.insertBefore(this.inputEl, this.contentEl)
        this.modalEl.insertBefore(this.resultContainerEl, this.contentEl)

        this.inputEl.addEventListener('input', () => { void this.updateSuggestions() })
        this.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); this.setSelectedIndex(this.selectedIndex + 1) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); this.setSelectedIndex(this.selectedIndex - 1) }
          else if (e.key === 'Enter') { e.preventDefault(); this.selectActiveSuggestion(e) }
        })
      }

      open(): void {
        super.open()
        this.inputEl.focus()
        void this.updateSuggestions()
      }

      setPlaceholder(placeholder: string): void { this.inputEl.placeholder = placeholder }
      /** Instruction hints (e.g. "↵ to select"). Cosmetic only — not rendered. */
      setInstructions(_instructions: Array<{ command: string; purpose: string }>): void { /* no-op */ }

      onNoSuggestion(): void {
        this.resultContainerEl.innerHTML = ''
        const empty = document.createElement('div')
        empty.className = 'suggestion-empty'
        empty.style.cssText = 'padding:12px;color:var(--text-muted,#888);text-align:center;'
        empty.textContent = this.emptyStateText
        this.resultContainerEl.appendChild(empty)
      }

      selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void {
        this.onChooseSuggestion(value, evt)
        this.close()
      }

      selectActiveSuggestion(evt: MouseEvent | KeyboardEvent): void {
        const item = this.suggestions[this.selectedIndex]
        if (item !== undefined) this.selectSuggestion(item, evt)
      }

      /** Return suggestions for the current query. Plugins override this. */
      getSuggestions(_query: string): T[] | Promise<T[]> { return [] }
      /** Render a suggestion item. Plugins override this. */
      renderSuggestion(_value: T, _el: HTMLElement): void { /* plugins override */ }
      /** Handle the user choosing a suggestion. Plugins override this. */
      onChooseSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent): void { /* plugins override */ }

      private async updateSuggestions(): Promise<void> {
        const query = this.inputEl.value
        const result = this.getSuggestions(query)
        const items = result instanceof Promise ? await result : result
        this.suggestions = items.slice(0, this.limit)
        this.selectedIndex = 0
        this.renderSuggestions()
      }

      private renderSuggestions(): void {
        this.resultContainerEl.innerHTML = ''
        if (this.suggestions.length === 0) { this.onNoSuggestion(); return }
        for (let i = 0; i < this.suggestions.length; i++) {
          const item = this.suggestions[i]!
          const el = document.createElement('div')
          el.className = 'suggestion-item'
          el.style.cssText = 'padding:8px 12px;cursor:pointer;border-radius:4px;'
          if (i === this.selectedIndex) {
            el.style.background = 'var(--bg-elevated, #f0f0f0)'
            el.classList.add('is-selected')
          }
          el.addEventListener('mousedown', (e) => { e.preventDefault(); this.selectSuggestion(item, e) })
          el.addEventListener('mouseenter', () => { this.setSelectedIndex(i) })
          this.renderSuggestion(item, el)
          this.resultContainerEl.appendChild(el)
        }
      }

      private setSelectedIndex(index: number): void {
        if (this.suggestions.length === 0) return
        this.selectedIndex = ((index % this.suggestions.length) + this.suggestions.length) % this.suggestions.length
        const items = this.resultContainerEl.querySelectorAll('.suggestion-item')
        items.forEach((el, i) => {
          if (i === this.selectedIndex) {
            el.classList.add('is-selected')
            ;(el as HTMLElement).style.background = 'var(--bg-elevated, #f0f0f0)'
            el.scrollIntoView({ block: 'nearest' })
          } else {
            el.classList.remove('is-selected')
            ;(el as HTMLElement).style.background = ''
          }
        })
      }
    } as unknown as Record<string, unknown>

    const SuggestModalClass = window.obsidian.SuggestModal as { new (app: unknown): { limit: number; getSuggestions(q: string): unknown } }
    window.obsidian.FuzzySuggestModal = class FuzzySuggestModal<T> extends SuggestModalClass {
      /** Return all searchable items. Plugins override this. */
      getItems(): T[] { return [] }
      /** Return the searchable text for an item. Plugins override this. */
      getItemText(_item: T): string { return '' }
      /** Handle the user choosing an item. Plugins override this. */
      onChooseItem(_item: T, _evt: MouseEvent | KeyboardEvent): void { /* plugins override */ }

      getSuggestions(query: string): FuzzyMatchResult<T>[] {
        const items = this.getItems()
        if (!query.trim()) {
          return items.map(item => ({ item, match: { score: 0, matches: [] } }))
        }
        const lowerQuery = query.toLowerCase()
        const results: FuzzyMatchResult<T>[] = []
        for (const item of items) {
          const text = this.getItemText(item)
          const matchResult = fuzzyMatchText(lowerQuery, text.toLowerCase())
          if (matchResult) results.push({ item, match: matchResult })
        }
        // Lower score is better (fewer/tighter gaps between matched characters).
        results.sort((a, b) => a.match.score - b.match.score)
        return results
      }

      renderSuggestion(fuzzyMatch: FuzzyMatchResult<T>, el: HTMLElement): void {
        el.textContent = this.getItemText(fuzzyMatch.item)
      }

      onChooseSuggestion(fuzzyMatch: FuzzyMatchResult<T>, evt: MouseEvent | KeyboardEvent): void {
        this.onChooseItem(fuzzyMatch.item, evt)
      }
    } as unknown as Record<string, unknown>
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
