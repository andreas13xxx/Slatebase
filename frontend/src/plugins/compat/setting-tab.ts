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
    }
  }

  // Obsidian extends HTMLElement with convenience methods.
  // Plugins use these everywhere (containerEl.empty(), containerEl.createEl(), etc.)
  if (!HTMLElement.prototype.hasOwnProperty('empty')) {
    Object.defineProperty(HTMLElement.prototype, 'empty', {
      value: function (this: HTMLElement) {
        this.innerHTML = ''
        return this
      },
      writable: true,
      configurable: true,
    })
  }
  if (!HTMLElement.prototype.hasOwnProperty('createEl')) {
    Object.defineProperty(HTMLElement.prototype, 'createEl', {
      value: function (this: HTMLElement, tag: string, options?: { cls?: string; text?: string; attr?: Record<string, string>; type?: string; href?: string; placeholder?: string; value?: string }) {
        const el = document.createElement(tag)
        if (options) {
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
        return el
      },
      writable: true,
      configurable: true,
    })
  }
  if (!HTMLElement.prototype.hasOwnProperty('createDiv')) {
    Object.defineProperty(HTMLElement.prototype, 'createDiv', {
      value: function (this: HTMLElement, options?: { cls?: string; text?: string }) {
        return (this as unknown as { createEl: (tag: string, opts?: unknown) => HTMLElement }).createEl('div', options)
      },
      writable: true,
      configurable: true,
    })
  }
  if (!HTMLElement.prototype.hasOwnProperty('createSpan')) {
    Object.defineProperty(HTMLElement.prototype, 'createSpan', {
      value: function (this: HTMLElement, options?: { cls?: string; text?: string }) {
        return (this as unknown as { createEl: (tag: string, opts?: unknown) => HTMLElement }).createEl('span', options)
      },
      writable: true,
      configurable: true,
    })
  }
  if (!HTMLElement.prototype.hasOwnProperty('addClass')) {
    Object.defineProperty(HTMLElement.prototype, 'addClass', {
      value: function (this: HTMLElement, ...classes: string[]) {
        this.classList.add(...classes)
        return this
      },
      writable: true,
      configurable: true,
    })
  }
  if (!HTMLElement.prototype.hasOwnProperty('removeClass')) {
    Object.defineProperty(HTMLElement.prototype, 'removeClass', {
      value: function (this: HTMLElement, ...classes: string[]) {
        this.classList.remove(...classes)
        return this
      },
      writable: true,
      configurable: true,
    })
  }
  if (!HTMLElement.prototype.hasOwnProperty('toggleClass')) {
    Object.defineProperty(HTMLElement.prototype, 'toggleClass', {
      value: function (this: HTMLElement, cls: string, force?: boolean) {
        this.classList.toggle(cls, force)
        return this
      },
      writable: true,
      configurable: true,
    })
  }
  if (!HTMLElement.prototype.hasOwnProperty('hasClass')) {
    Object.defineProperty(HTMLElement.prototype, 'hasClass', {
      value: function (this: HTMLElement, cls: string) {
        return this.classList.contains(cls)
      },
      writable: true,
      configurable: true,
    })
  }
  if (!HTMLElement.prototype.hasOwnProperty('setText')) {
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
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      onload() {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      onunload() {}
      async loadData(): Promise<unknown> { return null }
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      async saveData(_data: unknown): Promise<void> {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      addCommand(_cmd: unknown): void {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      addSettingTab(_tab: unknown): void {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      registerEvent(_ref: unknown): void {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
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
      addRibbonIcon(_icon: string, _title: string, _callback: () => void): HTMLElement {
        return document.createElement('div')
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

  // ItemView — base class for custom plugin views (Calendar, Kanban, etc.)
  if (!window.obsidian.ItemView) {
    window.obsidian.ItemView = class ItemView {
      containerEl: HTMLElement
      contentEl: HTMLElement
      app: unknown
      leaf: unknown
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
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      onload(): void {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      onunload(): void {}
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

  // Moment.js shim for plugins that use window.moment (like Calendar)
  // moment.min.js is loaded synchronously in index.html, so window.moment should be available.
  if (typeof window !== 'undefined') {
    const win = window as unknown as { moment?: unknown }
    if (win.moment) {
      // Re-export the global moment on the obsidian module
      Object.defineProperty(window.obsidian, 'moment', {
        value: win.moment,
        writable: true,
        configurable: true,
        enumerable: true,
      })
    } else if (!window.obsidian.moment) {
      // Fallback: try loading from CDN if the local file failed, plus a minimal stub
      const cdnUrls = [
        'https://unpkg.com/moment@2.30.1/min/moment.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.30.1/moment.min.js',
      ]
      for (const url of cdnUrls) {
        const script = document.createElement('script')
        script.src = url
        script.onload = () => {
          const w = window as unknown as { moment?: unknown }
          if (w.moment) {
            Object.defineProperty(window.obsidian!, 'moment', {
              value: w.moment, writable: true, configurable: true, enumerable: true,
            })
          }
        }
        document.head.appendChild(script)
      }

      // Minimal chainable stub with localeData support (used by Calendar's week-start setting)
      const createStub = (): Record<string, unknown> => {
        const stub: Record<string, unknown> = {}
        const chainMethods = ['clone', 'add', 'subtract', 'startOf', 'endOf', 'local', 'utc', 'set']
        const valueMethods: Record<string, unknown> = {
          format: () => '', isSame: () => false, isBefore: () => false, isAfter: () => false,
          weekday: () => 0, day: () => 0, date: () => 1, month: () => 0, year: () => 2026,
          daysInMonth: () => 30, locale: () => 'en', toDate: () => new Date(),
          valueOf: () => Date.now(), unix: () => Math.floor(Date.now() / 1000),
          isValid: () => true, diff: () => 0, get: () => 0,
        }
        for (const m of chainMethods) { stub[m] = () => stub }
        for (const [k, v] of Object.entries(valueMethods)) { stub[k] = v }
        return stub
      }
      const localeData = { _week: { dow: 0, doy: 6 }, firstDayOfWeek: () => 0, weekdaysShort: () => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], weekdaysMin: () => ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'], months: () => [] }
      const momentFn = () => createStub()
      momentFn.locale = () => 'en'
      momentFn.localeData = () => localeData
      momentFn.weekdays = () => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      momentFn.weekdaysShort = () => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      momentFn.duration = () => createStub()
      Object.defineProperty(window.obsidian, 'moment', {
        value: momentFn, writable: true, configurable: true, enumerable: true,
      })
    }
  }

  // Common Obsidian API stubs that plugins may reference
  if (!window.obsidian.Notice) {
    window.obsidian.Notice = class Notice {
      constructor(message: string, _timeout?: number) {
        console.log('[Obsidian Notice]', message)
      }
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      hide() {}
    } as unknown as Record<string, unknown>
  }
  if (!window.obsidian.Modal) {
    window.obsidian.Modal = class Modal {
      app: unknown
      containerEl: HTMLElement
      contentEl: HTMLElement
      constructor(app: unknown) {
        this.app = app
        this.containerEl = document.createElement('div')
        this.contentEl = document.createElement('div')
      }
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      open() {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      close() {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      onOpen() {}
      // eslint-disable-next-line @typescript-eslint/no-empty-function
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

  // obsidian-daily-notes-interface stubs (used by Calendar plugin)
  if (!(window as unknown as { __obsidianDailyNotesInterface?: unknown }).__obsidianDailyNotesInterface) {
    (window as unknown as { __obsidianDailyNotesInterface: Record<string, unknown> }).__obsidianDailyNotesInterface = {
      getDailyNoteSettings: () => ({ format: 'YYYY-MM-DD', folder: '', template: '' }),
      getAllDailyNotes: () => ({}),
      getDailyNote: () => null,
      createDailyNote: async () => null,
      getDateFromFile: () => null,
      getDateUID: () => '',
      appHasDailyNotesPluginLoaded: () => true,
    }
  }
}
