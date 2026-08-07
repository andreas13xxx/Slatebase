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
 * These classes are registered onto `window.obsidian` by `install-globals.ts`,
 * which also installs the rest of the compatibility namespace.
 *
 * @module setting-tab
 */

import type { IAppShim, PluginInstance } from './types'
import { renderLucideIconInto } from './lucide-icons'

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

  /**
   * Return declarative setting definitions (Obsidian 1.13+).
   * Plugins override this to provide declarative settings instead of imperative display().
   * When this returns a non-empty array, the framework renders settings from definitions
   * instead of calling display().
   */
  getSettingDefinitions(): unknown[] {
    return []
  }

  /**
   * Read the current value for a control key.
   * Default implementation reads from plugin.settings.
   * Plugins override this for custom storage.
   */
  getControlValue(key: string): unknown {
    const settings = (this.plugin as unknown as { settings?: Record<string, unknown> }).settings
    if (settings && typeof settings === 'object') {
      return settings[key]
    }
    return undefined
  }

  /**
   * Persist a new value for a control key.
   * Default implementation writes to plugin.settings and calls saveData.
   * Plugins override this for custom storage.
   */
  setControlValue(key: string, value: unknown): void | Promise<void> {
    const settings = (this.plugin as unknown as { settings?: Record<string, unknown> }).settings
    if (settings && typeof settings === 'object') {
      settings[key] = value
    }
    return (this.plugin as unknown as { save_settings?: () => Promise<void>; saveData?: (data: unknown) => Promise<void> }).save_settings?.()
      ?? (this.plugin as unknown as { saveData?: (data: unknown) => Promise<void> }).saveData?.(settings)
  }

  /**
   * Re-render the declarative settings.
   * Called by plugins after state changes that affect visible/disabled predicates.
   */
  update(): void {
    // Re-render: clear containerEl and re-render from definitions
    const defs = this.getSettingDefinitions()
    if (defs.length > 0) {
      this.containerEl.innerHTML = ''
      // Dynamic import to avoid circular deps — render on next microtask
      void import('./declarative-settings-renderer').then(({ renderSettingDefinitions }) => {
        renderSettingDefinitions(defs as import('./declarative-settings-renderer').SettingDefinitionItem[], this.containerEl, this)
      })
    } else {
      // Fallback: re-call display() for imperative tabs
      this.containerEl.innerHTML = ''
      this.display()
    }
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

  setTooltip(tooltip: string): this {
    this.inputEl.title = tooltip
    return this
  }

  then(cb: (component: this) => void): this {
    cb(this)
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

  setDisabled(disabled: boolean): this {
    this.inputEl.disabled = disabled
    return this
  }

  setTooltip(tooltip: string): this {
    this.inputEl.title = tooltip
    return this
  }

  then(cb: (component: this) => void): this {
    cb(this)
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

  setTooltip(tooltip: string): this {
    this.toggleEl.title = tooltip
    return this
  }

  then(cb: (component: this) => void): this {
    cb(this)
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

  setDisabled(disabled: boolean): this {
    this.selectEl.disabled = disabled
    return this
  }

  setTooltip(tooltip: string): this {
    this.selectEl.title = tooltip
    return this
  }

  then(cb: (component: this) => void): this {
    cb(this)
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

  setTooltip(tooltip: string): this {
    this.buttonEl.title = tooltip
    return this
  }

  setIcon(icon: string): this {
    this.buttonEl.innerHTML = ''
    renderLucideIconInto(this.buttonEl, icon)
    return this
  }

  setClass(cls: string): this {
    // Keep our own 'setting-button' styling hook at the end of the class
    // list rather than the front. Plugins (e.g. editing-toolbar) rely on
    // attribute selectors like [class^=editingToolbarCommandsubItem] that
    // only match when their own class is the first token — real Obsidian's
    // ButtonComponent never injects a class ahead of what the plugin sets.
    this.buttonEl.classList.remove('setting-button')
    this.buttonEl.classList.add(cls)
    this.buttonEl.classList.add('setting-button')
    return this
  }

  removeCta(): this {
    this.buttonEl.classList.remove('setting-button--cta')
    return this
  }

  then(cb: (component: this) => void): this {
    cb(this)
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

  addColorPicker(callback: (component: { getValue(): string; setValue(value: string): unknown; onChange(cb: (value: string) => void): unknown; setDisabled(d: boolean): unknown; then(cb: (c: unknown) => void): unknown }) => void): this {
    const input = document.createElement('input')
    input.type = 'color'
    input.className = 'setting-color-picker'
    this.controlEl.appendChild(input)
    let changeCb: ((v: string) => void) | null = null
    input.addEventListener('input', () => { if (changeCb) changeCb(input.value) })
    const component = {
      getValue() { return input.value },
      setValue(value: string) { input.value = value; return this },
      onChange(cb: (value: string) => void) { changeCb = cb; return this },
      setDisabled(d: boolean) { input.disabled = d; return this },
      then(cb: (c: unknown) => void) { cb(this); return this },
    }
    callback(component)
    return this
  }

  addSearch(callback: (component: { inputEl: HTMLInputElement; getValue(): string; setValue(value: string): unknown; setPlaceholder(p: string): unknown; onChange(cb: (value: string) => void): unknown; then(cb: (c: unknown) => void): unknown }) => void): this {
    const input = document.createElement('input')
    input.type = 'search'
    input.className = 'setting-search-input'
    this.controlEl.appendChild(input)
    let changeCb: ((v: string) => void) | null = null
    input.addEventListener('input', () => { if (changeCb) changeCb(input.value) })
    const component = {
      inputEl: input,
      getValue() { return input.value },
      setValue(value: string) { input.value = value; return this },
      setPlaceholder(p: string) { input.placeholder = p; return this },
      onChange(cb: (value: string) => void) { changeCb = cb; return this },
      then(cb: (c: unknown) => void) { cb(this); return this },
    }
    callback(component)
    return this
  }

  /**
   * Add a moment.js date format input with live preview.
   * Obsidian plugins use this for date/time format configuration (e.g. Kanban date display format).
   */
  addMomentFormat(callback: (component: { inputEl: HTMLInputElement; getValue(): string; setValue(value: string): unknown; setPlaceholder(p: string): unknown; setDefaultFormat(format: string): unknown; setSampleEl(el: HTMLElement): unknown; onChange(cb: (value: string) => void): unknown; then(cb: (c: unknown) => void): unknown }) => void): this {
    const wrapper = document.createElement('div')
    wrapper.className = 'setting-moment-format'
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'setting-text-input'
    const preview = document.createElement('div')
    preview.className = 'setting-moment-format-preview'
    preview.style.fontSize = '0.8em'
    preview.style.opacity = '0.7'
    preview.style.marginTop = '4px'
    wrapper.appendChild(input)
    wrapper.appendChild(preview)
    this.controlEl.appendChild(wrapper)

    let changeCb: ((v: string) => void) | null = null
    let defaultFormat = ''
    let sampleEl: HTMLElement | null = preview

    const updatePreview = (): void => {
      const fmt = input.value || defaultFormat
      if (sampleEl && typeof (window as unknown as { moment?: (v?: unknown) => { format(f: string): string } }).moment === 'function') {
        try {
          sampleEl.textContent = (window as unknown as { moment: () => { format(f: string): string } }).moment().format(fmt)
        } catch {
          sampleEl.textContent = ''
        }
      }
    }

    input.addEventListener('input', () => {
      updatePreview()
      if (changeCb) changeCb(input.value)
    })

    const component = {
      inputEl: input,
      getValue() { return input.value },
      setValue(value: string) { input.value = value; updatePreview(); return this },
      setPlaceholder(p: string) { input.placeholder = p; return this },
      setDefaultFormat(format: string) { defaultFormat = format; input.placeholder = format; updatePreview(); return this },
      setSampleEl(el: HTMLElement) { sampleEl = el; updatePreview(); return this },
      onChange(cb: (value: string) => void) { changeCb = cb; return this },
      then(cb: (c: unknown) => void) { cb(this); return this },
    }
    callback(component)
    updatePreview()
    return this
  }

  /** Clear the control area (useful for dynamic updates). */
  clear(): this {
    this.controlEl.innerHTML = ''
    return this
  }

  /** Add custom HTML element to the control area. */
  addExtraButton(callback: (component: { extraSettingsEl: HTMLElement; setIcon(icon: string): unknown; setTooltip(tooltip: string): unknown; onClick(cb: () => void): unknown; setDisabled(d: boolean): unknown; then(cb: (c: unknown) => void): unknown }) => void): this {
    const el = document.createElement('div')
    el.className = 'setting-extra-button clickable-icon'
    this.controlEl.appendChild(el)
    const component = {
      extraSettingsEl: el,
      setIcon(_icon: string) { return this },
      setTooltip(tooltip: string) { el.title = tooltip; return this },
      onClick(cb: () => void) { el.addEventListener('click', cb); return this },
      setDisabled(_d: boolean) { return this },
      then(cb: (c: unknown) => void) { cb(this); return this },
    }
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

  /** Set a tooltip on the setting row. */
  setTooltip(_tooltip: string): this {
    return this
  }

  /** Facilitates chaining. */
  then(cb: (setting: this) => void): this {
    cb(this)
    return this
  }
}
