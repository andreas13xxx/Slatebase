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
import { ProgressBarComponent } from './obsidian-api-extensions'
import { getCustomIconSvg, sizeCustomIconSvg } from '../../utils/pluginIcon'

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
 * BaseComponent — real Obsidian's shared base of every Setting UI control.
 * `install-globals.ts` registers this same class as `window.obsidian.BaseComponent`
 * (imported from here, not redefined) so both sides of the API stay one class.
 */
export class BaseComponent {
  disabled = false
  then(cb: (component: this) => void): this { cb(this); return this }
  setDisabled(disabled: boolean): this { this.disabled = disabled; return this }
}

/** ValueComponent<T> — BaseComponent plus the get/set value pattern. */
export class ValueComponent<T> extends BaseComponent {
  getValue(): T { return undefined as unknown as T }
  setValue(_value: T): this { return this }
  registerOptionListener(_listeners: unknown, _key: string): this { return this }
}

/**
 * AbstractTextComponent<E> — shared base of TextComponent/TextAreaComponent.
 * Real Obsidian: `AbstractTextComponent<E> extends ValueComponent<string>`.
 */
export abstract class AbstractTextComponent<E extends HTMLInputElement | HTMLTextAreaElement> extends ValueComponent<string> {
  inputEl: E
  private changeCallback: ((value: string) => void) | null = null

  constructor(inputEl: E) {
    super()
    this.inputEl = inputEl
    this.inputEl.addEventListener('input', () => {
      if (this.changeCallback) this.changeCallback(this.inputEl.value)
    })
  }

  getValue(): string { return this.inputEl.value }
  setValue(value: string): this { this.inputEl.value = value; return this }
  setPlaceholder(placeholder: string): this { this.inputEl.placeholder = placeholder; return this }
  onChange(callback: (value: string) => void): this { this.changeCallback = callback; return this }
  setTooltip(tooltip: string): this { this.inputEl.title = tooltip; return this }
  /** BaseComponent's generic setDisabled, specialized to the wrapped input element. */
  override setDisabled(disabled: boolean): this { this.inputEl.disabled = disabled; return super.setDisabled(disabled) }
}

/**
 * TextComponent — Wraps an input[type=text] element with fluent API.
 */
export class TextComponent extends AbstractTextComponent<HTMLInputElement> {
  constructor(containerEl: HTMLElement) {
    const inputEl = document.createElement('input')
    inputEl.type = 'text'
    inputEl.className = 'setting-text-input'
    containerEl.appendChild(inputEl)
    super(inputEl)
  }
}

/**
 * TextAreaComponent — Wraps a textarea element with fluent API.
 */
export class TextAreaComponent extends AbstractTextComponent<HTMLTextAreaElement> {
  constructor(containerEl: HTMLElement) {
    const inputEl = document.createElement('textarea')
    inputEl.className = 'setting-textarea-input'
    containerEl.appendChild(inputEl)
    super(inputEl)
  }
}

/**
 * ToggleComponent — Wraps a toggle switch element with fluent API.
 * Real Obsidian: `ToggleComponent extends ValueComponent<boolean>`.
 */
export class ToggleComponent extends ValueComponent<boolean> {
  toggleEl: HTMLElement
  private inputEl: HTMLInputElement
  private changeCallback: ((value: boolean) => void) | null = null

  constructor(containerEl: HTMLElement) {
    super()
    this.toggleEl = document.createElement('label')
    // Two names on purpose: `setting-toggle` is Slatebase's own (styled in
    // App.css), `checkbox-container` is what Obsidian renders. Plugin and theme
    // CSS is written against the latter, and some plugins reach for the element
    // with `querySelector('.checkbox-container')`.
    this.toggleEl.className = 'setting-toggle checkbox-container'

    this.inputEl = document.createElement('input')
    this.inputEl.type = 'checkbox'
    this.inputEl.className = 'setting-toggle-input'

    const slider = document.createElement('span')
    slider.className = 'setting-toggle-slider'

    this.toggleEl.appendChild(this.inputEl)
    this.toggleEl.appendChild(slider)
    containerEl.appendChild(this.toggleEl)

    this.inputEl.addEventListener('change', () => {
      this.syncEnabledClass()
      if (this.changeCallback) {
        this.changeCallback(this.inputEl.checked)
      }
    })
  }

  /** Obsidian marks the on-state with `is-enabled` on the container, not with :checked. */
  private syncEnabledClass(): void {
    this.toggleEl.classList.toggle('is-enabled', this.inputEl.checked)
  }

  setValue(value: boolean): this {
    this.inputEl.checked = value
    this.syncEnabledClass()
    return this
  }

  getValue(): boolean {
    return this.inputEl.checked
  }

  override setDisabled(disabled: boolean): this {
    this.inputEl.disabled = disabled
    return super.setDisabled(disabled)
  }

  onChange(callback: (value: boolean) => void): this {
    this.changeCallback = callback
    return this
  }

  setTooltip(tooltip: string): this {
    this.toggleEl.title = tooltip
    return this
  }
}

/**
 * DropdownComponent — Wraps a select element with fluent API.
 * Real Obsidian: `DropdownComponent extends ValueComponent<string>`.
 */
export class DropdownComponent extends ValueComponent<string> {
  selectEl: HTMLSelectElement
  private changeCallback: ((value: string) => void) | null = null

  constructor(containerEl: HTMLElement) {
    super()
    this.selectEl = document.createElement('select')
    // `dropdown` is Obsidian's class for a select; plugin CSS targets it.
    this.selectEl.className = 'setting-dropdown dropdown'
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

  override setDisabled(disabled: boolean): this {
    this.selectEl.disabled = disabled
    return super.setDisabled(disabled)
  }

  setTooltip(tooltip: string): this {
    this.selectEl.title = tooltip
    return this
  }
}

/**
 * ButtonComponent — Wraps a button element with fluent API.
 * Real Obsidian: `ButtonComponent extends BaseComponent` (no value to hold).
 */
export class ButtonComponent extends BaseComponent {
  buttonEl: HTMLButtonElement
  private clickCallback: (() => void) | null = null

  constructor(containerEl: HTMLElement) {
    super()
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

  // `mod-cta`/`mod-warning` are Obsidian's own modifier classes and carry the
  // styling plugins and themes expect; ours are kept alongside for App.css.
  setCta(): this {
    this.buttonEl.classList.add('setting-button--cta', 'mod-cta')
    return this
  }

  setWarning(): this {
    this.buttonEl.classList.add('setting-button--warning', 'mod-warning')
    return this
  }

  override setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled
    return super.setDisabled(disabled)
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
    // Custom icons registered via addIcon() first, same as window.obsidian.setIcon —
    // otherwise a plugin's own SVG (e.g. a settings-dialog action button) falls
    // through to the Lucide-only resolver and warns as an unrecognized Obsidian id.
    const customSvg = getCustomIconSvg(icon)
    if (customSvg) {
      // Unsized (no viewBox-independent width/height) custom SVGs a plugin
      // registers via addIcon() default to the browser's intrinsic <svg> size
      // instead of the button's — invisible or wildly oversized depending on
      // the plugin's own viewBox, not just missing. Same fix as the React
      // icon components (PluginRibbonIcon etc.) already apply.
      this.buttonEl.innerHTML = sizeCustomIconSvg(customSvg, 16)
      return this
    }
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
    this.buttonEl.classList.remove('setting-button--cta', 'mod-cta')
    return this
  }
}

/**
 * SliderComponent — Wraps an input[type=range] element with fluent API.
 * Real Obsidian: `SliderComponent extends ValueComponent<number>`.
 */
export class SliderComponent extends ValueComponent<number> {
  sliderEl: HTMLInputElement
  private changeCallback: ((value: number) => void) | null = null
  private tooltipEl: HTMLElement | null = null
  /**
   * Since Obsidian 1.5.9, a slider only fires `onChange` when released, not on
   * every drag tick — `setInstant(true)` opts back into the old continuous
   * behavior. The tooltip still tracks the drag live either way; only the
   * callback timing changes.
   */
  private instant = false
  /** Obsidian API since 1.13.1. Formats the dynamic tooltip's displayed text. */
  private displayFormat: ((value: number) => string) | null = null

  constructor(containerEl: HTMLElement) {
    super()
    this.sliderEl = document.createElement('input')
    this.sliderEl.type = 'range'
    // `slider` is Obsidian's class for a range input; plugin CSS targets it.
    this.sliderEl.className = 'setting-slider slider'
    this.sliderEl.addEventListener('input', () => {
      if (this.tooltipEl) {
        this.tooltipEl.textContent = this.formatValue(this.sliderEl.value)
      }
      if (this.instant && this.changeCallback) {
        this.changeCallback(Number(this.sliderEl.value))
      }
    })
    this.sliderEl.addEventListener('change', () => {
      if (!this.instant && this.changeCallback) {
        this.changeCallback(Number(this.sliderEl.value))
      }
    })
    containerEl.appendChild(this.sliderEl)
  }

  /**
   * Obsidian API since 1.5.9. `true` restores the old continuous-update
   * behavior (fire `onChange` on every drag tick); `false` (the default,
   * matching current Obsidian) fires only once the slider is released.
   */
  setInstant(instant: boolean): this {
    this.instant = instant
    return this
  }

  /** Obsidian API since 1.13.1. Formats the value shown in the dynamic tooltip. */
  setDisplayFormat(format: (value: number) => string): this {
    this.displayFormat = format
    if (this.tooltipEl) {
      this.tooltipEl.textContent = this.formatValue(this.sliderEl.value)
    }
    return this
  }

  private formatValue(rawValue: string): string {
    return this.displayFormat ? this.displayFormat(Number(rawValue)) : rawValue
  }

  setValue(value: number): this {
    this.sliderEl.value = String(value)
    if (this.tooltipEl) {
      this.tooltipEl.textContent = this.formatValue(String(value))
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
      this.tooltipEl.textContent = this.formatValue(this.sliderEl.value)
      if (this.sliderEl.parentElement) {
        this.sliderEl.parentElement.appendChild(this.tooltipEl)
      }
    }
    return this
  }

  override setDisabled(disabled: boolean): this {
    this.sliderEl.disabled = disabled
    return super.setDisabled(disabled)
  }

  onChange(callback: (value: number) => void): this {
    this.changeCallback = callback
    return this
  }
}

/**
 * SecretComponent — Password-style input for API keys/tokens (Obsidian 1.11.4+).
 * Real Obsidian: `SecretComponent extends BaseComponent`, constructed as
 * `new SecretComponent(app, containerEl)` and added to a row via the generic
 * `Setting.addComponent()` (there is no dedicated `Setting.addSecret()` in the
 * real API). Deliberately has no `getValue()` — real Obsidian's SecretComponent
 * doesn't expose one either; the value only ever flows out through `onChange()`.
 */
export class SecretComponent extends BaseComponent {
  private inputEl: HTMLInputElement
  private changeCallback: ((value: string | null) => void) | null = null

  constructor(_app: unknown, containerEl: HTMLElement) {
    super()
    this.inputEl = document.createElement('input')
    this.inputEl.type = 'password'
    this.inputEl.className = 'setting-secret-input'
    this.inputEl.addEventListener('input', () => {
      if (this.changeCallback) this.changeCallback(this.inputEl.value || null)
    })
    containerEl.appendChild(this.inputEl)
  }

  setValue(value: string): this {
    this.inputEl.value = value
    return this
  }

  onChange(callback: (value: string | null) => void): this {
    this.changeCallback = callback
    return this
  }

  override setDisabled(disabled: boolean): this {
    this.inputEl.disabled = disabled
    return super.setDisabled(disabled)
  }
}

/**
 * DisplayValueComponent — Read-only computed-value label for a setting row
 * (Obsidian 1.13.1+). Real Obsidian: plain `class DisplayValueComponent {}`,
 * not a BaseComponent (no disabled state — there's nothing to disable on a
 * label), added via `Setting.addDisplayValue()`.
 */
export class DisplayValueComponent {
  valueEl: HTMLElement

  constructor(containerEl: HTMLElement) {
    this.valueEl = document.createElement('div')
    this.valueEl.className = 'setting-display-value'
    containerEl.appendChild(this.valueEl)
  }

  setValue(value: string | null): this {
    this.valueEl.textContent = value ?? ''
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
  /**
   * Every control added to this row (real Obsidian field). `setDisabled()`
   * propagates to each of these — without tracking them, disabling a Setting
   * only dimmed the row visually while its `<input>` stayed interactive.
   */
  components: Array<{ setDisabled(disabled: boolean): unknown }> = []
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

  setName(name: string | DocumentFragment): this {
    if (name instanceof DocumentFragment) {
      this.nameEl.textContent = ''
      this.nameEl.appendChild(name)
    } else {
      this.nameEl.textContent = name
    }
    return this
  }

  setDesc(desc: string | DocumentFragment): this {
    if (desc instanceof DocumentFragment) {
      this.descEl.textContent = ''
      this.descEl.appendChild(desc)
    } else {
      this.descEl.textContent = desc
    }
    return this
  }

  setHeading(): this {
    // Obsidian's name is `setting-item-heading`; ours is the BEM variant styled
    // in App.css. Both are applied so plugin CSS matches too — obsidian-components.css
    // carries the Obsidian-named rule.
    this.settingEl.classList.add('setting-item--heading', 'setting-item-heading')
    return this
  }

  setClass(cls: string): this {
    this.settingEl.classList.add(cls)
    return this
  }

  addText(callback: (component: TextComponent) => void): this {
    const component = new TextComponent(this.controlEl)
    this.components.push(component)
    callback(component)
    return this
  }

  addTextArea(callback: (component: TextAreaComponent) => void): this {
    const component = new TextAreaComponent(this.controlEl)
    this.components.push(component)
    callback(component)
    return this
  }

  addToggle(callback: (component: ToggleComponent) => void): this {
    const component = new ToggleComponent(this.controlEl)
    this.components.push(component)
    callback(component)
    return this
  }

  addDropdown(callback: (component: DropdownComponent) => void): this {
    const component = new DropdownComponent(this.controlEl)
    this.components.push(component)
    callback(component)
    return this
  }

  addButton(callback: (component: ButtonComponent) => void): this {
    const component = new ButtonComponent(this.controlEl)
    this.components.push(component)
    callback(component)
    return this
  }

  addSlider(callback: (component: SliderComponent) => void): this {
    const component = new SliderComponent(this.controlEl)
    this.components.push(component)
    callback(component)
    return this
  }

  /**
   * Generic escape hatch for adding an arbitrary BaseComponent to the row
   * (Obsidian API since 1.11.0) — this is how real Obsidian expects plugins to
   * wire up e.g. `SecretComponent`, which has no dedicated `addSecret()`.
   */
  addComponent<T extends BaseComponent>(cb: (el: HTMLElement) => T): this {
    const el = document.createElement('div')
    el.className = 'setting-component'
    this.controlEl.appendChild(el)
    const component = cb(el)
    this.components.push(component)
    return this
  }

  /**
   * Add a read-only computed-value label (Obsidian API since 1.13.1) — e.g.
   * showing a slider's value in words, or a cache size next to a "Clear cache"
   * button. Not tracked in `components` — like ProgressBarComponent, a plain
   * label has no `setDisabled`.
   */
  addDisplayValue(callback: (component: DisplayValueComponent) => void): this {
    const component = new DisplayValueComponent(this.controlEl)
    callback(component)
    return this
  }

  /**
   * Add a progress bar (Obsidian 1.4.4+).
   * Not tracked in `components` — ProgressBarComponent has no setDisabled
   * (a progress indicator isn't interactive, so there is nothing to disable).
   */
  addProgressBar(callback: (component: ProgressBarComponent) => void): this {
    const component = new ProgressBarComponent(this.controlEl)
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
    this.components.push(component)
    callback(component)
    return this
  }

  /**
   * Add a search box.
   *
   * The DOM mirrors Obsidian's: a `.search-input-container` wrapping the input
   * and a `.search-input-clear-button`. Both the structure and the clear button
   * are load-bearing — plugin CSS positions the button against the container,
   * and `containerEl`/`clearButtonEl` are part of Obsidian's SearchComponent.
   */
  addSearch(callback: (component: { inputEl: HTMLInputElement; containerEl: HTMLElement; clearButtonEl: HTMLElement; getValue(): string; setValue(value: string): unknown; setPlaceholder(p: string): unknown; onChange(cb: (value: string) => void): unknown; setDisabled(d: boolean): unknown; setStatus(status: 'warning' | null): unknown; then(cb: (c: unknown) => void): unknown }) => void): this {
    const container = document.createElement('div')
    container.className = 'search-input-container'
    const input = document.createElement('input')
    input.type = 'search'
    input.className = 'setting-search-input search-input'
    input.spellcheck = false
    const clearButton = document.createElement('div')
    clearButton.className = 'search-input-clear-button is-hidden'
    clearButton.setAttribute('aria-label', 'Clear search')
    container.appendChild(input)
    container.appendChild(clearButton)
    this.controlEl.appendChild(container)

    let changeCb: ((v: string) => void) | null = null
    const syncClearButton = (): void => {
      clearButton.classList.toggle('is-hidden', input.value.length === 0)
    }
    const emit = (): void => { if (changeCb) changeCb(input.value) }
    input.addEventListener('input', () => { syncClearButton(); emit() })
    clearButton.addEventListener('click', () => {
      input.value = ''
      syncClearButton()
      input.focus()
      emit()
    })
    const component = {
      inputEl: input,
      containerEl: container,
      clearButtonEl: clearButton,
      getValue() { return input.value },
      setValue(value: string) { input.value = value; syncClearButton(); return this },
      setPlaceholder(p: string) { input.placeholder = p; return this },
      onChange(cb: (value: string) => void) { changeCb = cb; return this },
      setDisabled(d: boolean) { input.disabled = d; return this },
      // Obsidian API since 1.13.1 — validation-status affordance on search-like inputs.
      setStatus(status: 'warning' | null) { container.classList.toggle('setting-search--warning', status === 'warning'); return this },
      then(cb: (c: unknown) => void) { cb(this); return this },
    }
    this.components.push(component)
    callback(component)
    return this
  }

  /**
   * Add a moment.js date format input with live preview.
   * Obsidian plugins use this for date/time format configuration (e.g. Kanban date display format).
   */
  addMomentFormat(callback: (component: { inputEl: HTMLInputElement; getValue(): string; setValue(value: string): unknown; setPlaceholder(p: string): unknown; setDefaultFormat(format: string): unknown; setSampleEl(el: HTMLElement): unknown; onChange(cb: (value: string) => void): unknown; setDisabled(d: boolean): unknown; then(cb: (c: unknown) => void): unknown }) => void): this {
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
      setDisabled(d: boolean) { input.disabled = d; return this },
      then(cb: (c: unknown) => void) { cb(this); return this },
    }
    this.components.push(component)
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
      setDisabled(d: boolean) {
        el.classList.toggle('is-disabled', d)
        el.style.pointerEvents = d ? 'none' : ''
        return this
      },
      then(cb: (c: unknown) => void) { cb(this); return this },
    }
    this.components.push(component)
    callback(component)
    return this
  }

  /**
   * Disable (or re-enable) the entire setting row — real Obsidian propagates
   * this to every control added via addText/addToggle/etc., not just a CSS
   * class on the row, so the inputs themselves stop accepting input too.
   */
  setDisabled(disabled: boolean): this {
    if (disabled) {
      this.settingEl.classList.add('setting-item--disabled')
    } else {
      this.settingEl.classList.remove('setting-item--disabled')
    }
    for (const component of this.components) {
      component.setDisabled(disabled)
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

/**
 * Groups multiple Setting rows under a shared heading, with optional search/
 * extra-button controls in the header (Obsidian 1.11+). Plugins that adopt the
 * declarative settings API (getSettingDefinitions()) receive one of these as the
 * `render` callback's second argument; some plugins also subclass it directly
 * for custom grouped settings UI, so it must be a real extendable class rather
 * than an inline shape — `class X extends SettingGroup` evaluates at bundle
 * parse time and throws immediately if the name resolves to undefined.
 */
export class SettingGroup {
  /** Obsidian's container for the group's Setting rows. */
  listEl: HTMLElement
  private groupEl: HTMLElement
  private headerEl: HTMLElement
  private headingEl: HTMLElement | null = null

  constructor(containerEl: HTMLElement) {
    this.groupEl = document.createElement('div')
    this.groupEl.className = 'setting-group'

    this.headerEl = document.createElement('div')
    this.headerEl.className = 'setting-group-header'

    this.listEl = document.createElement('div')
    this.listEl.className = 'setting-group-list'

    this.groupEl.appendChild(this.headerEl)
    this.groupEl.appendChild(this.listEl)
    containerEl.appendChild(this.groupEl)
  }

  setHeading(text: string | DocumentFragment): this {
    if (!this.headingEl) {
      this.headingEl = document.createElement('div')
      this.headingEl.className = 'setting-group-heading setting-item-heading'
      this.headerEl.insertBefore(this.headingEl, this.headerEl.firstChild)
    }
    this.headingEl.textContent = ''
    if (typeof text === 'string') this.headingEl.textContent = text
    else this.headingEl.appendChild(text)
    return this
  }

  addClass(...classes: string[]): this {
    this.groupEl.classList.add(...classes)
    return this
  }

  addSetting(cb: (setting: Setting) => void): this {
    cb(new Setting(this.listEl))
    return this
  }

  /**
   * Generic escape hatch for adding an arbitrary BaseComponent to the group's
   * header (Obsidian API since 1.11.0) — mirrors `Setting.addComponent()`.
   */
  addComponent<T extends BaseComponent>(cb: (el: HTMLElement) => T): this {
    const el = document.createElement('div')
    el.className = 'setting-component'
    this.headerEl.appendChild(el)
    cb(el)
    return this
  }

  /** Search input at the beginning of the group's header — mirrors Setting.addSearch's DOM shape. */
  addSearch(callback: (component: { inputEl: HTMLInputElement; containerEl: HTMLElement; clearButtonEl: HTMLElement; getValue(): string; setValue(value: string): unknown; setPlaceholder(p: string): unknown; onChange(cb: (value: string) => void): unknown; setDisabled(d: boolean): unknown; setStatus(status: 'warning' | null): unknown; then(cb: (c: unknown) => void): unknown }) => void): this {
    const container = document.createElement('div')
    container.className = 'search-input-container'
    const input = document.createElement('input')
    input.type = 'search'
    input.className = 'setting-search-input search-input'
    input.spellcheck = false
    const clearButton = document.createElement('div')
    clearButton.className = 'search-input-clear-button is-hidden'
    clearButton.setAttribute('aria-label', 'Clear search')
    container.appendChild(input)
    container.appendChild(clearButton)
    this.headerEl.appendChild(container)

    let changeCb: ((v: string) => void) | null = null
    const syncClearButton = (): void => {
      clearButton.classList.toggle('is-hidden', input.value.length === 0)
    }
    const emit = (): void => { if (changeCb) changeCb(input.value) }
    input.addEventListener('input', () => { syncClearButton(); emit() })
    clearButton.addEventListener('click', () => {
      input.value = ''
      syncClearButton()
      input.focus()
      emit()
    })
    const component = {
      inputEl: input,
      containerEl: container,
      clearButtonEl: clearButton,
      getValue() { return input.value },
      setValue(value: string) { input.value = value; syncClearButton(); return this },
      setPlaceholder(p: string) { input.placeholder = p; return this },
      onChange(cb: (value: string) => void) { changeCb = cb; return this },
      setDisabled(d: boolean) { input.disabled = d; return this },
      setStatus(status: 'warning' | null) { container.classList.toggle('setting-search--warning', status === 'warning'); return this },
      then(cb: (c: unknown) => void) { cb(this); return this },
    }
    callback(component)
    return this
  }

  addExtraButton(callback: (component: { extraSettingsEl: HTMLElement; setIcon(icon: string): unknown; setTooltip(tooltip: string): unknown; onClick(cb: () => void): unknown; setDisabled(d: boolean): unknown; then(cb: (c: unknown) => void): unknown }) => void): this {
    const el = document.createElement('div')
    el.className = 'setting-extra-button clickable-icon'
    this.headerEl.appendChild(el)
    const component = {
      extraSettingsEl: el,
      setIcon(_icon: string) { return this },
      setTooltip(tooltip: string) { el.title = tooltip; return this },
      onClick(cb: () => void) { el.addEventListener('click', cb); return this },
      setDisabled(d: boolean) {
        el.classList.toggle('is-disabled', d)
        el.style.pointerEvents = d ? 'none' : ''
        return this
      },
      then(cb: (c: unknown) => void) { cb(this); return this },
    }
    callback(component)
    return this
  }
}
