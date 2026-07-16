/**
 * PluginSettingTab & Setting — Obsidian-compatible settings UI API.
 *
 * Plugins use `this.addSettingTab(new MySettingTab(this.app, this))` in `onload()`
 * to register a settings tab. The tab's `display()` method is called when the user
 * opens the plugin's settings, rendering UI into `this.containerEl`.
 *
 * The `Setting` class provides a fluent builder API for constructing settings UI
 * (text inputs, toggles, dropdowns, buttons, etc.) that render as DOM elements.
 *
 * @module setting-tab
 */

import type { IAppShim, PluginInstance } from './types'
import { addRibbonIcon as registerRibbonIcon } from './ribbon-icon-registry'
import moment from 'moment/min/moment-with-locales'

// ─── PluginSettingTab ────────────────────────────────────────────────────────────

/**
 * PluginSettingTab — Base class that plugins extend to create their settings UI.
 *
 * Plugins override `display()` to populate `this.containerEl` with settings
 * using the `Setting` builder class.
 */
export class PluginSettingTab {
  /** The DOM element where the settings UI is rendered. */
  containerEl: HTMLElement

  /** Reference to the app instance. */
  app: IAppShim

  /** Reference to the plugin instance. */
  plugin: PluginInstance

  constructor(app: IAppShim, plugin: PluginInstance) {
    this.app = app
    this.plugin = plugin
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'plugin-setting-tab'
  }

  /**
   * Called when the settings tab should be displayed.
   * Plugins override this to build their settings UI.
   */
  display(): void {
    // Base implementation — plugins override this
  }

  /**
   * Called when the settings tab is hidden.
   * Plugins can override to do cleanup.
   */
  hide(): void {
    // Base implementation — plugins override this
  }
}

// ─── Setting (Fluent UI Builder) ─────────────────────────────────────────────────

/**
 * TextComponent — Wraps an input[type=text] element with fluent API.
 */
export class TextComponent {
  inputEl: HTMLInputElement
  private changeCallback: ((value: string) => void) | null = null

  constructor(containerEl: HTMLElement) {
    this.inputEl = document.createElement('input')
    this.inputEl.type = 'text'
    this.inputEl.className = 'setting-text-input'
    this.inputEl.addEventListener('input', () => {
      if (this.changeCallback) {
        this.changeCallback(this.inputEl.value)
      }
    })
    containerEl.appendChild(this.inputEl)
  }

  setValue(value: string): this {
    this.inputEl.value = value
    return this
  }

  getValue(): string {
    return this.inputEl.value
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder
    return this
  }

  setDisabled(disabled: boolean): this {
    this.inputEl.disabled = disabled
    return this
  }

  onChange(callback: (value: string) => void): this {
    this.changeCallback = callback
    return this
  }
}

/**
 * TextAreaComponent — Wraps a textarea element with fluent API.
 */
export class TextAreaComponent {
  inputEl: HTMLTextAreaElement
  private changeCallback: ((value: string) => void) | null = null

  constructor(containerEl: HTMLElement) {
    this.inputEl = document.createElement('textarea')
    this.inputEl.className = 'setting-textarea-input'
    this.inputEl.addEventListener('input', () => {
      if (this.changeCallback) {
        this.changeCallback(this.inputEl.value)
      }
    })
    containerEl.appendChild(this.inputEl)
  }

  setValue(value: string): this {
    this.inputEl.value = value
    return this
  }

  getValue(): string {
    return this.inputEl.value
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder
    return this
  }

  onChange(callback: (value: string) => void): this {
    this.changeCallback = callback
    return this
  }
}

/**
 * ToggleComponent — Wraps a toggle switch element with fluent API.
 */
export class ToggleComponent {
  toggleEl: HTMLElement
  private inputEl: HTMLInputElement
  private changeCallback: ((value: boolean) => void) | null = null

  constructor(containerEl: HTMLElement) {
    this.toggleEl = document.createElement('label')
    this.toggleEl.className = 'setting-toggle'

    this.inputEl = document.createElement('input')
    this.inputEl.type = 'checkbox'
    this.inputEl.className = 'setting-toggle-input'

    const slider = document.createElement('span')
    slider.className = 'setting-toggle-slider'

    this.toggleEl.appendChild(this.inputEl)
    this.toggleEl.appendChild(slider)
    containerEl.appendChild(this.toggleEl)

    this.inputEl.addEventListener('change', () => {
      if (this.changeCallback) {
        this.changeCallback(this.inputEl.checked)
      }
    })
  }

  setValue(value: boolean): this {
    this.inputEl.checked = value
    return this
  }

  getValue(): boolean {
    return this.inputEl.checked
  }

  setDisabled(disabled: boolean): this {
    this.inputEl.disabled = disabled
    return this
  }

  onChange(callback: (value: boolean) => void): this {
    this.changeCallback = callback
    return this
  }
}

/**
 * DropdownComponent — Wraps a select element with fluent API.
 */
export class DropdownComponent {
  selectEl: HTMLSelectElement
  private changeCallback: ((value: string) => void) | null = null

  constructor(containerEl: HTMLElement) {
    this.selectEl = document.createElement('select')
    this.selectEl.className = 'setting-dropdown'
    this.selectEl.addEventListener('change', () => {
      if (this.changeCallback) {
        this.changeCallback(this.selectEl.value)
      }
    })
    containerEl.appendChild(this.selectEl)
  }

  addOption(value: string, display: string): this {
    const option = document.createElement('option')
    option.value = value
    option.textContent = display
    this.selectEl.appendChild(option)
    return this
  }

  addOptions(options: Record<string, string>): this {
    for (const [value, display] of Object.entries(options)) {
      this.addOption(value, display)
    }
    return this
  }

  setValue(value: string): this {
    this.selectEl.value = value
    return this
  }

  getValue(): string {
    return this.selectEl.value
  }

  onChange(callback: (value: string) => void): this {
    this.changeCallback = callback
    return this
  }
}

/**
 * ButtonComponent — Wraps a button element with fluent API.
 */
export class ButtonComponent {
  buttonEl: HTMLButtonElement
  private clickCallback: (() => void) | null = null

  constructor(containerEl: HTMLElement) {
    this.buttonEl = document.createElement('button')
    this.buttonEl.className = 'setting-button'
    this.buttonEl.addEventListener('click', () => {
      if (this.clickCallback) {
        this.clickCallback()
      }
    })
    containerEl.appendChild(this.buttonEl)
  }

  setButtonText(text: string): this {
    this.buttonEl.textContent = text
    return this
  }

  setCta(): this {
    this.buttonEl.classList.add('setting-button--cta')
    return this
  }

  setWarning(): this {
    this.buttonEl.classList.add('setting-button--warning')
    return this
  }

  setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled
    return this
  }

  onClick(callback: () => void): this {
    this.clickCallback = callback
    return this
  }
}

/**
 * SliderComponent — Wraps an input[type=range] element with fluent API.
 */
export class SliderComponent {
  sliderEl: HTMLInputElement
  private changeCallback: ((value: number) => void) | null = null
  private tooltipEl: HTMLElement | null = null

  constructor(containerEl: HTMLElement) {
    this.sliderEl = document.createElement('input')
    this.sliderEl.type = 'range'
    this.sliderEl.className = 'setting-slider'
    this.sliderEl.addEventListener('input', () => {
      if (this.tooltipEl) {
        this.tooltipEl.textContent = this.sliderEl.value
      }
      if (this.changeCallback) {
        this.changeCallback(Number(this.sliderEl.value))
      }
    })
    containerEl.appendChild(this.sliderEl)
  }

  setValue(value: number): this {
    this.sliderEl.value = String(value)
    if (this.tooltipEl) {
      this.tooltipEl.textContent = String(value)
    }
    return this
  }

  getValue(): number {
    return Number(this.sliderEl.value)
  }

  setLimits(min: number, max: number, step: number): this {
    this.sliderEl.min = String(min)
    this.sliderEl.max = String(max)
    this.sliderEl.step = String(step)
    return this
  }

  setDynamicTooltip(): this {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('span')
      this.tooltipEl.className = 'setting-slider-tooltip'
      this.tooltipEl.textContent = this.sliderEl.value
      if (this.sliderEl.parentElement) {
        this.sliderEl.parentElement.appendChild(this.tooltipEl)
      }
    }
    return this
  }

  setDisabled(disabled: boolean): this {
    this.sliderEl.disabled = disabled
    return this
  }

  onChange(callback: (value: number) => void): this {
    this.changeCallback = callback
    return this
  }
}

/**
 * Setting — Fluent UI builder for a single setting row.
 *
 * Usage by plugins:
 * ```ts
 * new Setting(containerEl)
 *   .setName('My Setting')
 *   .setDesc('Description of what this does')
 *   .addText(text => text.setValue('hello').onChange(val => { ... }))
 * ```
 */
export class Setting {
  settingEl: HTMLElement
  private nameEl: HTMLElement
  private descEl: HTMLElement
  private controlEl: HTMLElement
  private infoEl: HTMLElement

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div')
    this.settingEl.className = 'setting-item'

    this.infoEl = document.createElement('div')
    this.infoEl.className = 'setting-item-info'

    this.nameEl = document.createElement('div')
    this.nameEl.className = 'setting-item-name'

    this.descEl = document.createElement('div')
    this.descEl.className = 'setting-item-description'

    this.controlEl = document.createElement('div')
    this.controlEl.className = 'setting-item-control'

    this.infoEl.appendChild(this.nameEl)
    this.infoEl.appendChild(this.descEl)
    this.settingEl.appendChild(this.infoEl)
    this.settingEl.appendChild(this.controlEl)
    containerEl.appendChild(this.settingEl)
  }

  setName(name: string): this {
    this.nameEl.textContent = name
    return this
  }

  setDesc(desc: string): this {
    this.descEl.textContent = desc
    return this
  }

  setHeading(): this {
    this.settingEl.classList.add('setting-item--heading')
    return this
  }

  setClass(cls: string): this {
    this.settingEl.classList.add(cls)
    return this
  }

  addText(callback: (component: TextComponent) => void): this {
    const component = new TextComponent(this.controlEl)
    callback(component)
    return this
  }

  addTextArea(callback: (component: TextAreaComponent) => void): this {
    const component = new TextAreaComponent(this.controlEl)
    callback(component)
    return this
  }

  addToggle(callback: (component: ToggleComponent) => void): this {
    const component = new ToggleComponent(this.controlEl)
    callback(component)
    return this
  }

  addDropdown(callback: (component: DropdownComponent) => void): this {
    const component = new DropdownComponent(this.controlEl)
    callback(component)
    return this
  }

  addButton(callback: (component: ButtonComponent) => void): this {
    const component = new ButtonComponent(this.controlEl)
    callback(component)
    return this
  }

  addSlider(callback: (component: SliderComponent) => void): this {
    const component = new SliderComponent(this.controlEl)
    callback(component)
    return this
  }

  /** Clear the control area (useful for dynamic updates). */
  clear(): this {
    this.controlEl.innerHTML = ''
    return this
  }

  /** Add custom HTML element to the control area. */
  addExtraButton(callback: (component: ButtonComponent) => void): this {
    const component = new ButtonComponent(this.controlEl)
    component.buttonEl.classList.add('setting-extra-button')
    callback(component)
    return this
  }

  /** Show/hide the entire setting row. */
  setDisabled(disabled: boolean): this {
    if (disabled) {
      this.settingEl.classList.add('setting-item--disabled')
    } else {
      this.settingEl.classList.remove('setting-item--disabled')
    }
    return this
  }
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

if (typeof window !== 'undefined') {
  if (!window.obsidian) {
    window.obsidian = {}
  }

  // Obsidian exposes `window.app` as a global reference to the app instance.
  // Many plugins and libraries (like obsidian-daily-notes-interface) access it directly.
  if (!(window as unknown as { app?: unknown }).app) {
    (window as unknown as { app: Record<string, unknown> }).app = {
      internalPlugins: {
        plugins: {
          'daily-notes': { enabled: true, instance: { options: { format: 'YYYY-MM-DD', folder: '', template: '' } } },
        },
        getPluginById: (id: string) => {
          const plugins = ((window as unknown as { app: { internalPlugins: { plugins: Record<string, unknown> } } }).app.internalPlugins.plugins)
          return plugins[id] ?? undefined
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

  // Plugin base class — plugins extend this via `class MyPlugin extends Plugin`
  // The constructor receives the app instance from the PluginLoader
  if (!window.obsidian.Plugin) {
    window.obsidian.Plugin = class Plugin {
      app: unknown
      manifest: unknown
      private _intervals: number[] = []
      private _events: Array<{ target: EventTarget; event: string; handler: EventListenerOrEventListenerObject }> = []
      constructor(app: unknown) {
        this.app = app
        this.manifest = {}
        this._intervals = []
        this._events = []
      }
      onload() {}
      onunload() {}
      async loadData(): Promise<unknown> { return null }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async saveData(_data: unknown): Promise<void> {}
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      addCommand(_cmd: unknown): void {}
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      addSettingTab(_tab: unknown): void {}
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      registerEvent(_ref: unknown): void {}
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        return document.createElement('div')
      }
    } as unknown as Record<string, unknown>
  }

  window.obsidian.PluginSettingTab = PluginSettingTab
  window.obsidian.Setting = Setting
  window.obsidian.TextComponent = TextComponent
  window.obsidian.TextAreaComponent = TextAreaComponent
  window.obsidian.ToggleComponent = ToggleComponent
  window.obsidian.DropdownComponent = DropdownComponent
  window.obsidian.ButtonComponent = ButtonComponent
  window.obsidian.SliderComponent = SliderComponent

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
      addAction(_icon: string, _title: string, _callback: () => void): HTMLElement {
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(message: string, _timeout?: number) {
        console.log('[Obsidian Notice]', message)
      }
      hide() {}
    } as unknown as Record<string, unknown>
  }
  if (!window.obsidian.Modal) {
    window.obsidian.Modal = class Modal {
      app: unknown
      containerEl: HTMLElement
      contentEl: HTMLElement
      private overlayEl: HTMLElement | null = null
      constructor(app: unknown) {
        this.app = app
        this.containerEl = document.createElement('div')
        this.containerEl.className = 'modal-container'
        this.contentEl = document.createElement('div')
        this.contentEl.className = 'modal-content'
        this.containerEl.appendChild(this.contentEl)
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
        this.onOpen()
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
  if (!window.obsidian.requestUrl) {
    window.obsidian.requestUrl = async (urlOrRequest: unknown) => {
      const url = typeof urlOrRequest === 'string' ? urlOrRequest : (urlOrRequest as { url: string }).url
      const options = typeof urlOrRequest === 'string' ? {} : urlOrRequest as RequestInit
      const response = await fetch(url, options)
      const text = await response.text()
      let json: unknown = null
      try { json = JSON.parse(text) } catch { /* not json */ }
      return { status: response.status, headers: Object.fromEntries(response.headers.entries()), text, json }
    }
  }

  // obsidian-daily-notes-interface implementation (used by Calendar plugin)
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
}
