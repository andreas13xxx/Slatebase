/**
 * Last-resort fallback implementations for the `obsidian` module namespace.
 *
 * These previously lived as a ~100-line JavaScript string inside
 * `plugin-loader.ts`, injected into every evaluated plugin bundle. In that form
 * they were not typechecked, not linted, not testable and had no sourcemaps, and
 * because they were installed synchronously at plugin-evaluation time they could
 * race the real implementations and claim API names permanently.
 *
 * They live here as ordinary TypeScript instead, and are registered once —
 * *after* the real shims, so the real implementations always win. Everything is
 * guarded with `if (!obs[x])`, so this module only ever fills genuine gaps.
 *
 * Anything implemented here is deliberately minimal: the goal is to keep a
 * plugin from crashing outright on an unimplemented API, not to be correct.
 * Prefer adding a real implementation over extending this file.
 *
 * @module fallback-shims
 */

import { getStoredAuthToken, getStoredCsrfToken } from '../../state/authContext'
import { debugLog } from './log'
import { OBSIDIAN_API_VERSION, compareApiVersions } from './obsidian-api-extensions'

type Obs = Record<string, unknown>

/** Minimal shape of the pieces of `window` these fallbacks touch. */
interface FallbackWindow extends Window {
  obsidian?: Obs
  __slatebaseShowNotice?: (message: string, duration?: number) => void
}

// ─── Lifecycle base classes ──────────────────────────────────────────────────────

class FallbackComponent {
  _loaded = false
  load(): void { this._loaded = true; this.onload() }
  unload(): void { this._loaded = false; this.onunload() }
  onload(): void {}
  onunload(): void {}
  addChild<T>(c: T): T { (c as { load?: () => void })?.load?.(); return c }
  removeChild<T>(c: T): T { (c as { unload?: () => void })?.unload?.(); return c }
  register(): void {}
  registerEvent(): void {}
  registerInterval(id: number): number { return id }
  registerDomEvent(..._args: unknown[]): void {}
}

class FallbackEditorSuggest {
  scope = { keys: [] as unknown[], register: () => ({}), unregister: () => {} }
  suggestEl = document.createElement('div')
}

class FallbackEvents {
  private _e: Record<string, Array<(...args: unknown[]) => void>> = {}
  on(name: string, cb: (...args: unknown[]) => void): { id: number } {
    ;(this._e[name] ??= []).push(cb)
    return { id: 0 }
  }
  off(name: string, cb: (...args: unknown[]) => void): void {
    if (this._e[name]) this._e[name] = this._e[name]!.filter((f) => f !== cb)
  }
  offref(): void {}
  trigger(name: string, ...args: unknown[]): void {
    this._e[name]?.forEach((cb) => {
      try { cb(...args) } catch (e) { console.error(e) }
    })
  }
  tryTrigger(): void {}
}

class FallbackScope {
  private _h: Array<Record<string, unknown>> = []
  register(modifiers: unknown, key: unknown, func: unknown): Record<string, unknown> {
    const h = { modifiers, key, func }
    this._h.push(h)
    return h
  }
  unregister(h: Record<string, unknown>): void {
    const i = this._h.indexOf(h)
    if (i >= 0) this._h.splice(i, 1)
  }
}

class FallbackKeymap {
  static isModifier(evt: { metaKey?: boolean; ctrlKey?: boolean }, mod: string): boolean {
    if (mod === 'Mod') return Boolean(evt.metaKey || evt.ctrlKey)
    return false
  }
  static isModEvent(evt?: { metaKey?: boolean; ctrlKey?: boolean }): string | false {
    if (!evt) return false
    return evt.metaKey || evt.ctrlKey ? 'tab' : false
  }
  pushScope(): void {}
  popScope(): void {}
}

class FallbackSettingPage {
  rootEl = document.createElement('div')
  titlebarEl = document.createElement('div')
  containerEl = document.createElement('div')
  title = ''
  display(): void {}
  hide(): void {}
}

class FallbackBaseComponent {
  then(cb: (self: this) => void): this { cb(this); return this }
  setDisabled(): this { return this }
}

class FallbackValueComponent extends FallbackBaseComponent {
  getValue(): unknown { return undefined }
  setValue(): this { return this }
  registerOptionListener(): this { return this }
}

// ─── Utility functions ───────────────────────────────────────────────────────────

function fallbackParseYaml(s: string): unknown {
  try { return JSON.parse(s) } catch { return {} }
}

function fallbackStringifyYaml(o: unknown): string {
  return JSON.stringify(o, null, 2)
}

function fallbackParseLinktext(t: string): { path: string; subpath: string } {
  const i = t.indexOf('#')
  return i < 0 ? { path: t, subpath: '' } : { path: t.slice(0, i), subpath: t.slice(i) }
}

function fallbackGetLinkpath(t: string): string {
  const i = t.indexOf('#')
  return i < 0 ? t : t.slice(0, i)
}

function fallbackNormalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/\//g, '/').replace(/^\//, '')
}

function fallbackHtmlToMarkdown(h: string | { textContent?: string | null }): string {
  if (typeof h !== 'string') return h.textContent ?? ''
  // Parse via a detached <template> (never attached to the live DOM, so no
  // scripts/images execute) rather than a regex tag-stripper — malformed or
  // nested markup can survive a single regex pass, but the browser's own
  // HTML parser handles it correctly.
  const template = document.createElement('template')
  template.innerHTML = h
  return template.content.textContent ?? ''
}

function fallbackSanitizeHTMLToDom(h: string): DocumentFragment {
  const t = document.createElement('template')
  t.innerHTML = h
  return t.content
}

interface FallbackCache {
  tags?: Array<{ tag: string }>
  frontmatter?: Record<string, unknown>
}

function fallbackGetAllTags(cache: FallbackCache | null): string[] | null {
  if (!cache) return null
  const tags: string[] = []
  if (cache.tags) for (const t of cache.tags) tags.push(t.tag)

  const fm = cache.frontmatter
  const fmTags = fm ? (fm['tags'] ?? fm['tag']) : undefined
  const withHash = (t: string): string => (t.startsWith('#') ? t : '#' + t)

  if (Array.isArray(fmTags)) {
    for (const t of fmTags) tags.push(withHash(String(t)))
  } else if (typeof fmTags === 'string') {
    for (const raw of fmTags.split(',')) {
      const t = raw.trim()
      if (t) tags.push(withHash(t))
    }
  }
  return tags.length > 0 ? tags : null
}

interface FallbackFrontMatterInfo {
  exists: boolean
  frontmatter: string
  from: number
  to: number
  contentStart: number
}

function fallbackGetFrontMatterInfo(c: string): FallbackFrontMatterInfo {
  const empty: FallbackFrontMatterInfo = {
    exists: false, frontmatter: '', from: 0, to: 0, contentStart: 0,
  }
  if (!c.startsWith('---')) return empty
  const e = c.indexOf('\n---', 3)
  if (e < 0) return empty
  return { exists: true, frontmatter: c.slice(4, e), from: 4, to: e, contentStart: e + 4 }
}

function fallbackGetLanguage(): string {
  return (navigator.language || 'en').split('-')[0]!
}

interface DebouncedFn {
  (...args: unknown[]): void
  cancel(): DebouncedFn
  run(...args: unknown[]): unknown
}

function fallbackDebounce(
  cb: (...args: unknown[]) => unknown,
  timeout?: number,
  resetTimer?: boolean,
): DebouncedFn {
  let timer: ReturnType<typeof setTimeout> | null = null
  const debounced = function (this: unknown, ...args: unknown[]): void {
    if (resetTimer && timer) clearTimeout(timer)
    if (!timer || resetTimer) {
      // Arrow function: `this` stays the caller's receiver, as Obsidian's does.
      timer = setTimeout(() => {
        timer = null
        cb.apply(this, args)
      }, timeout ?? 0)
    }
  } as DebouncedFn
  debounced.cancel = function (): DebouncedFn {
    if (timer) { clearTimeout(timer); timer = null }
    return debounced
  }
  debounced.run = function (this: unknown, ...args: unknown[]): unknown {
    if (timer) {
      clearTimeout(timer)
      timer = null
      return cb.apply(this, args)
    }
    return undefined
  }
  return debounced
}

/** Fuzzy/simple search fallbacks never match — real ones live in obsidian-api-extensions. */
function fallbackPrepareSearch(): () => null {
  return () => null
}

// ─── Network ─────────────────────────────────────────────────────────────────────

interface RequestUrlParams {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string | ArrayBuffer
  contentType?: string
}

interface RequestUrlResult {
  status: number
  headers: Record<string, string>
  text?: string
  json?: unknown
  arrayBuffer?: ArrayBuffer
}

/** Promise with Obsidian's eager `.text`/`.json`/`.arrayBuffer` accessors. */
type RequestUrlPromise = Promise<RequestUrlResult> & {
  text?: Promise<string>
  json?: Promise<unknown>
  arrayBuffer?: Promise<ArrayBuffer | undefined>
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function fallbackRequestUrl(params: RequestUrlParams | string): RequestUrlPromise {
  const opts = typeof params === 'string' ? { url: params } : params
  const token = getStoredAuthToken() ?? ''
  const csrf = getStoredCsrfToken() ?? ''

  const encodedBody =
    opts.body === undefined
      ? undefined
      : typeof opts.body === 'string'
        ? opts.body
        : btoa(String.fromCharCode(...new Uint8Array(opts.body)))

  const p: RequestUrlPromise = fetch('/api/v1/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify({
      url: opts.url,
      method: opts.method ?? 'GET',
      headers: opts.headers,
      body: encodedBody,
      contentType: opts.contentType,
    }),
  }).then(async (r) => {
    const data = await r.json()
    if (!r.ok) throw new Error(data.message || 'Proxy request failed')

    const result: RequestUrlResult = { status: data.status, headers: data.headers || {} }
    const attachText = (text: string, buffer: ArrayBuffer): void => {
      result.text = text
      result.arrayBuffer = buffer
      try { result.json = JSON.parse(text) } catch { result.json = null }
    }

    if (data.text !== undefined) {
      attachText(data.text, new TextEncoder().encode(data.text).buffer as ArrayBuffer)
    } else if (data.arrayBuffer) {
      const buffer = base64ToArrayBuffer(data.arrayBuffer)
      attachText(new TextDecoder().decode(buffer), buffer)
    }
    return result
  })

  p.text = p.then((r) => r.text ?? '')
  p.json = p.then((r) => r.json)
  p.arrayBuffer = p.then((r) => r.arrayBuffer)
  return p
}

// ─── Views & UI ──────────────────────────────────────────────────────────────────

class FallbackNotice {
  noticeEl = document.createElement('div')
  messageEl = document.createElement('div')
  containerEl = document.createElement('div')
  private _shown = true

  constructor(message: string | { textContent?: string | null }, duration?: number) {
    ;(this.noticeEl as unknown as { isShown: () => boolean }).isShown = () => this._shown
    ;(window as FallbackWindow).__slatebaseShowNotice?.(toMessage(message), duration)
  }
  setMessage(message: string | { textContent?: string | null }): this {
    ;(window as FallbackWindow).__slatebaseShowNotice?.(toMessage(message))
    return this
  }
  hide(): void { this._shown = false }
  isShown(): boolean { return this._shown }
}

function toMessage(message: string | { textContent?: string | null }): string {
  return typeof message === 'string' ? message : (message?.textContent ?? '')
}

class FallbackMarkdownView {
  editor: { getValue(): string; setValue(v: string): void } | null = null
  file: { basename?: string } | null = null
  contentEl = document.createElement('div')
  containerEl = document.createElement('div')
  previewMode = { rerender(): void {} }
  currentMode = { get: (): string => '', set: (): void => {} }
  leaf: unknown

  constructor(leaf: unknown) { this.leaf = leaf }

  getViewType(): string { return 'markdown' }
  getDisplayText(): string { return this.file?.basename ?? 'Markdown' }
  getMode(): string { return 'source' }
  getViewData(): string { return this.editor?.getValue() ?? '' }
  clear(): void {}
  setViewData(d: string): void { this.editor?.setValue(d) }
  showSearch(): void {}
}

class FallbackFileSystemAdapter {
  getName(): string { return 'slatebase' }
  getBasePath(): string { return '/' }
  getFullPath(p: string): string { return p }
}

class FallbackAbstractInputSuggest {
  app: unknown
  textInputEl: HTMLInputElement

  constructor(app: unknown, textInputEl: HTMLInputElement) {
    this.app = app
    this.textInputEl = textInputEl
  }
  open(): void {}
  close(): void {}
  setValue(v: string): void { if (this.textInputEl) this.textInputEl.value = v }
  getValue(): string { return this.textInputEl?.value ?? '' }
  onSelect(): this { return this }
}

/** Shared no-op chainable helpers for the UI component fallbacks. */
abstract class FallbackChainable {
  then(cb: (self: this) => void): this { cb(this); return this }
  setDisabled(): this { return this }
  onChange(): this { return this }
}

class FallbackExtraButtonComponent extends FallbackChainable {
  extraSettingsEl = document.createElement('div')
  constructor(el: HTMLElement) { super(); el.appendChild(this.extraSettingsEl) }
  setIcon(): this { return this }
  setTooltip(): this { return this }
  onClick(): this { return this }
}

class FallbackColorComponent extends FallbackChainable {
  colorEl = document.createElement('input')
  constructor(el: HTMLElement) {
    super()
    this.colorEl.type = 'color'
    el.appendChild(this.colorEl)
  }
  getValue(): string { return this.colorEl.value }
  setValue(v: string): this { this.colorEl.value = v; return this }
}

class FallbackSearchComponent extends FallbackChainable {
  inputEl = document.createElement('input')
  clearButtonEl = document.createElement('div')
  constructor(el: HTMLElement) { super(); el.appendChild(this.inputEl) }
  getValue(): string { return this.inputEl.value }
  setValue(v: string): this { this.inputEl.value = v; return this }
  setPlaceholder(p: string): this { this.inputEl.placeholder = p; return this }
}

class FallbackMomentFormatComponent extends FallbackChainable {
  inputEl = document.createElement('input')
  sampleEl = document.createElement('span')
  constructor(el: HTMLElement) { super(); el.appendChild(this.inputEl) }
  setDefaultFormat(): this { return this }
  setSampleEl(): this { return this }
  getValue(): string { return this.inputEl.value }
  setValue(v: string): this { this.inputEl.value = v; return this }
}

class FallbackProgressBarComponent extends FallbackChainable {
  progressEl = document.createElement('progress')
  constructor(el: HTMLElement) { super(); el.appendChild(this.progressEl) }
  getValue(): number { return 0 }
  setValue(v: number): this { this.progressEl.value = v; return this }
}

// ─── Registration ────────────────────────────────────────────────────────────────

/**
 * Fill any still-unclaimed name on `window.obsidian` with a fallback.
 *
 * Must run *after* the real shims so the real implementations win. Safe to call
 * more than once — every assignment is guarded.
 */
export function registerFallbackShims(): void {
  if (typeof window === 'undefined') return
  const win = window as FallbackWindow
  const obs: Obs = (win.obsidian ??= {})

  // Names that had no real implementation. Reported below: this is the exact
  // list of APIs a plugin will get a do-nothing stub for, which is otherwise
  // invisible and very hard to diagnose from plugin behaviour alone.
  const filled: string[] = []

  const set = (name: string, value: unknown): void => {
    if (obs[name]) return
    obs[name] = value
    filled.push(name)
  }

  // Lifecycle base classes. `Plugin` and `MarkdownRenderChild` extend whichever
  // `Component` ended up registered, so plugin `instanceof` checks stay coherent.
  set('EditorSuggest', FallbackEditorSuggest)
  set('Component', FallbackComponent)

  const Component = obs['Component'] as typeof FallbackComponent
  set('Plugin', class FallbackPlugin extends Component {
    manifest: Record<string, unknown> = {}
    scope = { keys: [] as unknown[], register: (): void => {}, unregister: (): void => {} }
    private _children: unknown[] = []
    app: unknown
    constructor(app?: unknown) { super(); this.app = app }
    loadData(): Promise<unknown> { return Promise.resolve(null) }
    saveData(): Promise<void> { return Promise.resolve() }
    addCommand(): void {}
    addSettingTab(): void {}
    registerView(): void {}
    registerEditorSuggest(): void {}
    registerHoverLinkSource(): void {}
    override registerDomEvent(...args: unknown[]): void {
      const [el, ev, h] = args as [HTMLElement, string, EventListener]
      el?.addEventListener?.(ev, h)
    }
    addRibbonIcon(): HTMLElement { return document.createElement('div') }
    addStatusBarItem(): HTMLElement { return document.createElement('div') }
    override addChild<T>(c: T): T {
      this._children.push(c)
      ;(c as { load?: () => void })?.load?.()
      return c
    }
    override removeChild<T>(c: T): T {
      const i = this._children.indexOf(c)
      if (i >= 0) this._children.splice(i, 1)
      ;(c as { unload?: () => void })?.unload?.()
      return c
    }
    registerMarkdownPostProcessor<T>(p: T): T { return p }
    registerMarkdownCodeBlockProcessor(): Record<string, unknown> { return {} }
    registerEditorExtension(): void {}
    registerExtensions(): void {}
    registerObsidianProtocolHandler(): void {}
    removeCommand(): void {}
    registerCliHandler(): void {}
  })

  set('MarkdownRenderChild', class FallbackMarkdownRenderChild extends Component {
    containerEl?: HTMLElement
    constructor(containerEl?: HTMLElement) { super(); this.containerEl = containerEl }
  })

  const Modal = (obs['Modal'] ?? class { open(): void {} close(): void {} onOpen(): void {} onClose(): void {} }) as new (
    ...args: unknown[]
  ) => object
  set('ConfirmationModal', class FallbackConfirmationModal extends Modal {})

  set('SettingPage', FallbackSettingPage)
  set('Events', FallbackEvents)
  set('Scope', FallbackScope)
  set('Keymap', FallbackKeymap)
  set('BaseComponent', FallbackBaseComponent)
  set('ValueComponent', FallbackValueComponent)

  // Icons
  set('addIcon', () => {})
  set('setIcon', (el: unknown) => el)
  set('getIcon', () => null)
  set('getIconIds', () => [])
  set('removeIcon', () => {})

  // Version. Answering against the version we claim rather than always `true`,
  // for the same reason as the real implementation — see install-globals.
  set('apiVersion', OBSIDIAN_API_VERSION)
  set('requireApiVersion', (version: string) => compareApiVersions(OBSIDIAN_API_VERSION, version) >= 0)

  // Utilities
  set('parseYaml', fallbackParseYaml)
  set('stringifyYaml', fallbackStringifyYaml)
  set('parseLinktext', fallbackParseLinktext)
  set('getLinkpath', fallbackGetLinkpath)
  set('normalizePath', fallbackNormalizePath)
  set('htmlToMarkdown', fallbackHtmlToMarkdown)
  set('sanitizeHTMLToDom', fallbackSanitizeHTMLToDom)
  set('getAllTags', fallbackGetAllTags)
  set('getFrontMatterInfo', fallbackGetFrontMatterInfo)
  set('getLanguage', fallbackGetLanguage)
  set('debounce', fallbackDebounce)
  set('prepareFuzzySearch', fallbackPrepareSearch)
  set('prepareSimpleSearch', fallbackPrepareSearch)

  // Rendering
  set('MarkdownPreviewRenderer', {
    registerPostProcessor(): void {},
    unregisterPostProcessor(): void {},
    createCodeBlockPostProcessor(): () => void { return () => {} },
  })
  const escapeToEl = async (md: string, el: HTMLElement): Promise<void> => {
    el.textContent = md
  }
  set('MarkdownRenderer', {
    render: (_app: unknown, md: string, el: HTMLElement) => escapeToEl(md, el),
    renderMarkdown: (md: string, el: HTMLElement) => escapeToEl(md, el),
  })

  // Notifications
  set('Notice', FallbackNotice)

  // Network
  set('requestUrl', fallbackRequestUrl)
  set('request', (params: RequestUrlParams | string) =>
    fallbackRequestUrl(params).then((r) => r.text ?? ''))

  // Views
  set('MarkdownView', FallbackMarkdownView)
  set('FileSystemAdapter', FallbackFileSystemAdapter)
  set('EditableFileView', obs['FileView'] ?? class {})

  // UI components
  set('AbstractInputSuggest', FallbackAbstractInputSuggest)
  set('ExtraButtonComponent', FallbackExtraButtonComponent)
  set('ColorComponent', FallbackColorComponent)
  set('SearchComponent', FallbackSearchComponent)
  set('MomentFormatComponent', FallbackMomentFormatComponent)
  set('ProgressBarComponent', FallbackProgressBarComponent)

  // Type-test-only exports. Plugins narrow with `instanceof` against these
  // (`leaf.parent instanceof WorkspaceTabs`, `item instanceof MenuSeparator`)
  // and, being classes rather than values, that is nearly all they are used for.
  //
  // A missing name is not a silent gap here — `x instanceof undefined` is a
  // TypeError that takes the plugin down at an unrelated line. Declaring them
  // turns that into `false`, which is also the honest answer for the layout
  // classes: Slatebase's workspace is a flat set of tabs with no split/sidedock
  // object model, so nothing is an instance of them. `AbstractTextComponent`
  // and `PopoverSuggest` extend the concrete classes already registered above,
  // so for those the test answers correctly rather than just safely.
  //
  // PopoverSuggest is normally already set by installObsidianGlobals() (real
  // Component-chain base of EditorSuggest/AbstractInputSuggest) — `set()`'s
  // guard skips this in that case. EditorSuggest is the closer relative if this
  // fallback layer ever runs on its own; SuggestModal (unrelated in real
  // Obsidian — it only extends Modal) is the last-resort answer, not the first.
  const textComponent = obs['TextComponent'] as (new () => object) | undefined
  if (textComponent) set('AbstractTextComponent', textComponent)
  const popoverSuggestFallback = (obs['EditorSuggest'] ?? obs['SuggestModal']) as (new (...args: never[]) => object) | undefined
  if (popoverSuggestFallback) set('PopoverSuggest', popoverSuggestFallback)
  // MarkdownPreviewView is mostly an instanceof-only export (see the block
  // below), but real Obsidian also exposes a static `render()` on it, and at
  // least one plugin (day-planner's release-notes popup) calls
  // `MarkdownPreviewView.render(app, markdown, el, sourcePath, component)`
  // directly rather than `MarkdownRenderer.render()` — without it, that's an
  // uncaught "render is not a function" the first time the popup opens.
  // Subclassing (rather than assigning statics onto MarkdownView in place)
  // keeps the instanceof relationship without mutating the shared MarkdownView
  // class. The MarkdownRenderer lookup happens at call time, not here, so it
  // resolves to the real MarkdownRendererShim — registerMarkdownRendererGlobal()
  // overwrites `obsidian.MarkdownRenderer` with the real implementation right
  // after this function runs (see plugin-context.ts), by which point any
  // plugin's actual render() call is long past module init.
  const MarkdownViewBase = (obs['MarkdownView'] ?? class {}) as new (...args: never[]) => object
  class MarkdownPreviewViewFallback extends MarkdownViewBase {
    static async render(app: unknown, markdown: string, el: HTMLElement, sourcePath: string, component: unknown): Promise<void> {
      const renderer = obs['MarkdownRenderer'] as { render?: (...args: unknown[]) => Promise<void> } | undefined
      if (renderer?.render) {
        await renderer.render(app, markdown, el, sourcePath, component)
      } else {
        el.textContent = markdown
      }
    }
    static async renderMarkdown(markdown: string, el: HTMLElement, sourcePath: string, component: unknown): Promise<void> {
      return MarkdownPreviewViewFallback.render(null, markdown, el, sourcePath, component)
    }
  }
  set('MarkdownPreviewView', MarkdownPreviewViewFallback)
  set('MenuItem', class MenuItem {})
  set('MenuSeparator', class MenuSeparator {})
  for (const name of [
    'WorkspaceItem', 'WorkspaceParent', 'WorkspaceContainer', 'WorkspaceSplit',
    'WorkspaceTabs', 'WorkspaceRoot', 'WorkspaceSidedock', 'WorkspaceMobileDrawer',
    'WorkspaceWindow', 'WorkspaceFloating', 'WorkspaceRibbon',
  ]) {
    set(name, class WorkspaceLayoutItem {})
  }

  if (filled.length > 0) {
    debugLog(
      `[PluginCompat] ${filled.length} Obsidian API(s) resolved to the minimal ` +
        `fallback shim rather than a full implementation: ${filled.sort().join(', ')}`,
    )
  }
}
