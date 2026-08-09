/**
 * Declarative Settings Renderer — Renders Obsidian 1.13+ SettingDefinitionItem arrays.
 *
 * Since Obsidian 1.13, plugins can return a declarative settings structure from
 * `getSettingDefinitions()` instead of imperatively building UI in `display()`.
 * This renderer takes that structure and creates DOM elements using our existing
 * Setting/TextComponent/ToggleComponent/etc. classes.
 *
 * Supports:
 * - SettingDefinition with `control` (toggle, text, textarea, dropdown, slider, color, number, folder, file)
 * - SettingDefinition with `render` callback (imperative)
 * - SettingDefinition with `action` callback (clickable row)
 * - SettingDefinition empty (just name/desc)
 * - SettingDefinitionGroup (heading + items)
 * - SettingDefinitionList (group with addItem/onDelete/onReorder/emptyState)
 * - SettingDefinitionPage (navigable sub-page with items[] or page() factory)
 * - `visible` predicate (show/hide)
 * - `disabled` predicate on controls
 *
 * @module declarative-settings-renderer
 */

import {
  Setting,
  TextComponent,
  TextAreaComponent,
  ToggleComponent,
  DropdownComponent,
  SliderComponent,
} from './setting-tab'
import { warnOnce } from './log'

// ─── Types (matching Obsidian 1.13 obsidian.d.ts) ────────────────────────────

/** The setting tab instance that provides getControlValue/setControlValue. */
export interface IDeclarativeSettingTab {
  getControlValue(key: string): unknown
  setControlValue(key: string, value: unknown): void | Promise<void>
  containerEl: HTMLElement
  update(): void
}

/** A single control definition. */
export interface SettingControl {
  type: 'toggle' | 'dropdown' | 'text' | 'textarea' | 'number' | 'file' | 'folder' | 'slider' | 'color' | 'secret'
  key: string
  defaultValue?: unknown
  options?: Record<string, string>
  placeholder?: string
  min?: number
  max?: number
  step?: number | 'any'
  validate?: (value: unknown) => string | void | Promise<string | void>
  disabled?: boolean | (() => boolean)
  filter?: (item: unknown) => boolean
  includeRoot?: boolean
}

/** Base for all definition items. */
export interface SettingDefinitionBase {
  name: string
  desc?: string | DocumentFragment
  aliases?: string[]
  searchable?: boolean | (() => boolean)
  visible?: boolean | (() => boolean)
}

/** A definition with a control. */
export interface SettingDefinitionControl extends SettingDefinitionBase {
  control: SettingControl
  action?: never
  render?: never
}

/** A definition with a render callback. */
export interface SettingDefinitionRender extends SettingDefinitionBase {
  render: (setting: Setting, group: unknown) => void | (() => void)
  control?: never
  action?: never
}

/** A definition with an action callback. */
export interface SettingDefinitionAction extends SettingDefinitionBase {
  action: (el: HTMLElement, index: number) => void
  disabled?: boolean | (() => boolean)
  control?: never
  render?: never
}

/** An empty definition (just name/desc). */
export interface SettingDefinitionEmpty extends SettingDefinitionBase {
  control?: never
  action?: never
  render?: never
}

/** Union of all non-structural definitions. */
export type SettingDefinition = SettingDefinitionControl | SettingDefinitionRender | SettingDefinitionAction | SettingDefinitionEmpty

/** A group of settings. */
export interface SettingDefinitionGroup {
  type: 'group' | 'list'
  heading?: string
  cls?: string
  items?: SettingGroupItem[]
  visible?: boolean | (() => boolean)
  // List-specific
  emptyState?: string | DocumentFragment
  onReorder?: (oldIndex: number, newIndex: number) => void
  onDelete?: (index: number) => void
  addItem?: { name: string; action: (el: HTMLElement) => void }
  extraButtons?: Array<(component: unknown) => unknown>
  search?: { placeholder?: string; match: (def: unknown, query: string) => boolean }
}

/** A navigable sub-page. */
export interface SettingDefinitionPage {
  type: 'page'
  name: string
  desc?: string | DocumentFragment
  items?: SettingDefinitionItem[]
  page?: () => { rootEl: HTMLElement; containerEl: HTMLElement; title: string; display(): void; hide(): void }
  visible?: boolean | (() => boolean)
  displayValue?: string | (() => string)
  status?: 'warning' | null | (() => 'warning' | null)
}

/** Any setting definition item. */
export type SettingGroupItem = SettingDefinition | SettingDefinitionPage
export type SettingDefinitionItem = SettingDefinition | SettingDefinitionGroup | SettingDefinitionPage

// ─── Renderer ────────────────────────────────────────────────────────────────

/**
 * Render an array of SettingDefinitionItem into a container element.
 *
 * @param items - The declarative settings definitions
 * @param containerEl - The DOM element to render into
 * @param tab - The setting tab instance (for getControlValue/setControlValue)
 * @param depth - Current navigation depth (for page back-navigation)
 */
export function renderSettingDefinitions(
  items: SettingDefinitionItem[],
  containerEl: HTMLElement,
  tab: IDeclarativeSettingTab,
  depth: number = 0,
): void {
  for (const item of items) {
    // Check visibility
    if (!isVisible(item)) continue

    if ('type' in item && item.type === 'group') {
      renderGroup(item as SettingDefinitionGroup, containerEl, tab, depth)
    } else if ('type' in item && item.type === 'list') {
      renderList(item as SettingDefinitionGroup, containerEl, tab, depth)
    } else if ('type' in item && item.type === 'page') {
      renderPageLink(item as SettingDefinitionPage, containerEl, tab, depth)
    } else {
      renderDefinition(item as SettingDefinition, containerEl, tab, 0)
    }
  }
}

/** Check if an item is visible based on its `visible` predicate. */
function isVisible(item: { visible?: boolean | (() => boolean) }): boolean {
  if (item.visible === undefined) return true
  if (typeof item.visible === 'function') return item.visible()
  return item.visible
}

/** Check if a control is disabled based on its `disabled` predicate. */
function isDisabled(disabled?: boolean | (() => boolean)): boolean {
  if (disabled === undefined) return false
  if (typeof disabled === 'function') return disabled()
  return disabled
}

// ─── Group Renderer ──────────────────────────────────────────────────────────

function renderGroup(
  group: SettingDefinitionGroup,
  containerEl: HTMLElement,
  tab: IDeclarativeSettingTab,
  depth: number,
): void {
  const groupEl = document.createElement('div')
  groupEl.className = 'setting-group'
  if (group.cls) groupEl.classList.add(group.cls)

  // Heading
  if (group.heading) {
    const headingSetting = new Setting(groupEl)
    headingSetting.setName(group.heading)
    headingSetting.setHeading()
  }

  // Render items
  if (group.items) {
    for (const item of group.items) {
      if (!isVisible(item as { visible?: boolean | (() => boolean) })) continue
      if ('type' in item && item.type === 'page') {
        renderPageLink(item as SettingDefinitionPage, groupEl, tab, depth)
      } else {
        renderDefinition(item as SettingDefinition, groupEl, tab, 0)
      }
    }
  }

  containerEl.appendChild(groupEl)
}

// ─── List Renderer ───────────────────────────────────────────────────────────

function renderList(
  list: SettingDefinitionGroup,
  containerEl: HTMLElement,
  tab: IDeclarativeSettingTab,
  depth: number,
): void {
  const listEl = document.createElement('div')
  listEl.className = 'setting-list'
  if (list.cls) listEl.classList.add(list.cls)

  // Heading with optional add button
  if (list.heading || list.addItem) {
    const headerEl = document.createElement('div')
    headerEl.className = 'setting-list-header'

    if (list.heading) {
      const headingSetting = new Setting(headerEl)
      headingSetting.setName(list.heading)
      headingSetting.setHeading()
    }

    if (list.addItem) {
      const addBtn = document.createElement('button')
      addBtn.className = 'setting-list-add-btn clickable-icon'
      addBtn.title = list.addItem.name
      addBtn.textContent = '+'
      addBtn.addEventListener('click', () => {
        list.addItem!.action(addBtn)
      })
      headerEl.appendChild(addBtn)
    }

    listEl.appendChild(headerEl)
  }

  // Items
  if (!list.items || list.items.length === 0) {
    // Empty state
    if (list.emptyState) {
      const emptyEl = document.createElement('div')
      emptyEl.className = 'setting-list-empty'
      if (typeof list.emptyState === 'string') {
        emptyEl.textContent = list.emptyState
      } else {
        emptyEl.appendChild(list.emptyState)
      }
      listEl.appendChild(emptyEl)
    }
  } else {
    for (let i = 0; i < list.items.length; i++) {
      const item = list.items[i]!
      if (!isVisible(item as { visible?: boolean | (() => boolean) })) continue

      const itemEl = document.createElement('div')
      itemEl.className = 'setting-list-item'

      // Render the item content
      if ('type' in item && item.type === 'page') {
        renderPageLink(item as SettingDefinitionPage, itemEl, tab, depth)
      } else {
        const def = item as SettingDefinition
        const setting = new Setting(itemEl)
        if (def.name) setting.setName(def.name)
        if (def.desc) {
          if (typeof def.desc === 'string') {
            setting.setDesc(def.desc)
          } else {
            setting.settingEl.querySelector('.setting-item-description')?.appendChild(def.desc)
          }
        }

        // If has action callback — make clickable
        if ('action' in def && def.action && typeof def.action === 'function') {
          setting.settingEl.classList.add('setting-item--clickable')
          setting.settingEl.style.cursor = 'pointer'
          const actionFn = def.action
          const index = i
          setting.settingEl.addEventListener('click', () => {
            actionFn(setting.settingEl, index)
          })
        }

        // Render control if present
        if ('control' in def && def.control) {
          renderControl(def.control, setting, tab)
        }
      }

      // Delete button
      if (list.onDelete) {
        const deleteBtn = document.createElement('button')
        deleteBtn.className = 'setting-list-delete-btn clickable-icon'
        deleteBtn.title = 'Löschen'
        deleteBtn.textContent = '×'
        const deleteIndex = i
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          list.onDelete!(deleteIndex)
        })
        itemEl.appendChild(deleteBtn)
      }

      listEl.appendChild(itemEl)
    }
  }

  containerEl.appendChild(listEl)
}

// ─── Page Link Renderer ──────────────────────────────────────────────────────

function renderPageLink(
  page: SettingDefinitionPage,
  containerEl: HTMLElement,
  tab: IDeclarativeSettingTab,
  depth: number,
): void {
  const setting = new Setting(containerEl)
  setting.setName(page.name)
  if (page.desc) {
    if (typeof page.desc === 'string') {
      setting.setDesc(page.desc)
    } else {
      setting.settingEl.querySelector('.setting-item-description')?.appendChild(page.desc)
    }
  }

  // Make the row navigable (clickable → opens sub-page)
  setting.settingEl.classList.add('setting-item--navigable')
  setting.settingEl.style.cursor = 'pointer'

  // Arrow indicator
  const arrow = document.createElement('span')
  arrow.className = 'setting-item-arrow'
  arrow.textContent = '›'
  arrow.style.cssText = 'margin-left:auto;font-size:1.2em;opacity:0.5;padding-left:8px;'
  setting.settingEl.querySelector('.setting-item-control')?.appendChild(arrow)

  setting.settingEl.addEventListener('click', () => {
    openSubPage(page, tab, depth)
  })
}

/** Open a sub-page (replaces content in containerEl with page content + back button). */
function openSubPage(
  page: SettingDefinitionPage,
  tab: IDeclarativeSettingTab,
  depth: number,
): void {
  const containerEl = tab.containerEl
  // Save current content for back navigation
  const previousContent = containerEl.innerHTML

  containerEl.innerHTML = ''

  // Back button + title
  const headerEl = document.createElement('div')
  headerEl.className = 'setting-page-header'
  headerEl.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border-color,#333);'

  const backBtn = document.createElement('button')
  backBtn.className = 'setting-page-back-btn'
  backBtn.textContent = '← Zurück'
  backBtn.style.cssText = 'background:none;border:none;color:var(--text-accent,#7c8aff);cursor:pointer;font-size:13px;padding:4px 8px;border-radius:4px;'
  backBtn.addEventListener('mouseenter', () => { backBtn.style.background = 'var(--bg-hover,#333)' })
  backBtn.addEventListener('mouseleave', () => { backBtn.style.background = 'none' })
  backBtn.addEventListener('click', () => {
    // If page has a hide() method (factory page), call it
    if (activePage) {
      try { activePage.hide() } catch { /* ignore */ }
    }
    containerEl.innerHTML = previousContent
  })

  const titleEl = document.createElement('h3')
  titleEl.textContent = page.name
  titleEl.style.cssText = 'margin:0;font-size:1em;font-weight:600;'

  headerEl.appendChild(backBtn)
  headerEl.appendChild(titleEl)
  containerEl.appendChild(headerEl)

  // Render page content
  let activePage: { hide(): void } | null = null
  const pageContentEl = document.createElement('div')
  pageContentEl.className = 'setting-page-content'
  containerEl.appendChild(pageContentEl)

  if (page.page) {
    // Factory-based page
    const pageInstance = page.page()
    activePage = pageInstance
    try {
      pageInstance.display()
      pageContentEl.appendChild(pageInstance.containerEl)
    } catch (err) {
      console.error(`[DeclarativeSettings] Page "${page.name}" display() error:`, err)
      pageContentEl.textContent = `Fehler beim Laden der Seite: ${err instanceof Error ? err.message : String(err)}`
    }
  } else if (page.items) {
    // Declarative items sub-page
    renderSettingDefinitions(page.items, pageContentEl, tab, depth + 1)
  }
}

// ─── Single Definition Renderer ──────────────────────────────────────────────

function renderDefinition(
  def: SettingDefinition,
  containerEl: HTMLElement,
  tab: IDeclarativeSettingTab,
  index: number,
): void {
  const setting = new Setting(containerEl)

  if (def.name) setting.setName(def.name)
  if (def.desc) {
    if (typeof def.desc === 'string') {
      setting.setDesc(def.desc)
    } else {
      // DocumentFragment — append to descEl
      const descEl = setting.settingEl.querySelector('.setting-item-description')
      if (descEl) {
        descEl.textContent = ''
        descEl.appendChild(def.desc)
      }
    }
  }

  // Render callback (imperative)
  if ('render' in def && def.render) {
    def.render(setting, {})
    return
  }

  // Action callback (clickable row)
  if ('action' in def && def.action && typeof def.action === 'function') {
    setting.settingEl.classList.add('setting-item--clickable')
    setting.settingEl.style.cursor = 'pointer'
    const actionFn = def.action
    setting.settingEl.addEventListener('click', () => {
      actionFn(setting.settingEl, index)
    })
    return
  }

  // Control
  if ('control' in def && def.control) {
    renderControl(def.control, setting, tab)
  }
}

// ─── Control Renderer ────────────────────────────────────────────────────────

function renderControl(
  control: SettingControl,
  setting: Setting,
  tab: IDeclarativeSettingTab,
): void {
  const disabled = isDisabled(control.disabled)
  const currentValue = tab.getControlValue(control.key) ?? control.defaultValue

  switch (control.type) {
    case 'toggle': {
      setting.addToggle((toggle: ToggleComponent) => {
        toggle.setValue(currentValue === true)
        toggle.setDisabled(disabled)
        toggle.onChange((value: boolean) => {
          void tab.setControlValue(control.key, value)
        })
      })
      break
    }

    case 'text': {
      setting.addText((text: TextComponent) => {
        text.setValue(String(currentValue ?? ''))
        text.setDisabled(disabled)
        if (control.placeholder) text.setPlaceholder(control.placeholder)
        text.onChange((value: string) => {
          if (control.validate) {
            const result = control.validate(value)
            if (result instanceof Promise) {
              void result.then((msg) => { if (msg) warnOnce(`Settings.validate::${control.key}::${msg}`, `[Settings] Validation: ${msg}`) })
            } else if (result) {
              warnOnce(`Settings.validate::${control.key}::${result}`, `[Settings] Validation: ${result}`)
              return
            }
          }
          void tab.setControlValue(control.key, value)
        })
      })
      break
    }

    case 'textarea': {
      setting.addTextArea((textarea: TextAreaComponent) => {
        textarea.setValue(String(currentValue ?? ''))
        textarea.setDisabled(disabled)
        if (control.placeholder) textarea.setPlaceholder(control.placeholder)
        textarea.onChange((value: string) => {
          void tab.setControlValue(control.key, value)
        })
      })
      break
    }

    case 'number': {
      setting.addText((text: TextComponent) => {
        text.setValue(String(currentValue ?? ''))
        text.setDisabled(disabled)
        if (control.placeholder) text.setPlaceholder(control.placeholder)
        text.inputEl.type = 'number'
        if (control.min !== undefined) text.inputEl.min = String(control.min)
        if (control.max !== undefined) text.inputEl.max = String(control.max)
        if (control.step !== undefined) text.inputEl.step = String(control.step)
        text.onChange((value: string) => {
          const num = Number(value)
          if (control.validate) {
            const result = control.validate(num)
            if (result instanceof Promise) {
              void result.then((msg) => { if (msg) warnOnce(`Settings.validate::${control.key}::${msg}`, `[Settings] Validation: ${msg}`) })
            } else if (result) {
              warnOnce(`Settings.validate::${control.key}::${result}`, `[Settings] Validation: ${result}`)
              return
            }
          }
          void tab.setControlValue(control.key, num)
        })
      })
      break
    }

    case 'dropdown': {
      setting.addDropdown((dropdown: DropdownComponent) => {
        if (control.options) {
          dropdown.addOptions(control.options)
        }
        dropdown.setValue(String(currentValue ?? ''))
        dropdown.selectEl.disabled = disabled
        dropdown.onChange((value: string) => {
          void tab.setControlValue(control.key, value)
        })
      })
      break
    }

    case 'slider': {
      setting.addSlider((slider: SliderComponent) => {
        slider.setLimits(control.min ?? 0, control.max ?? 100, typeof control.step === 'number' ? control.step : 1)
        slider.setValue(typeof currentValue === 'number' ? currentValue : 0)
        slider.setDisabled(disabled)
        slider.setDynamicTooltip()
        slider.onChange((value: number) => {
          void tab.setControlValue(control.key, value)
        })
      })
      break
    }

    case 'color': {
      setting.addColorPicker((picker) => {
        picker.setValue(String(currentValue ?? '#000000'))
        picker.setDisabled(disabled)
        picker.onChange((value: string) => {
          void tab.setControlValue(control.key, value)
        })
      })
      break
    }

    case 'folder': {
      // Folder input — render as text input (full folder suggest would require vault tree access)
      setting.addText((text: TextComponent) => {
        text.setValue(String(currentValue ?? ''))
        text.setDisabled(disabled)
        if (control.placeholder) text.setPlaceholder(control.placeholder)
        else text.setPlaceholder('Ordnerpfad eingeben…')
        text.onChange((value: string) => {
          void tab.setControlValue(control.key, value)
        })
      })
      break
    }

    case 'file': {
      // File input — render as text input
      setting.addText((text: TextComponent) => {
        text.setValue(String(currentValue ?? ''))
        text.setDisabled(disabled)
        if (control.placeholder) text.setPlaceholder(control.placeholder)
        else text.setPlaceholder('Dateipfad eingeben…')
        text.onChange((value: string) => {
          void tab.setControlValue(control.key, value)
        })
      })
      break
    }

    case 'secret': {
      // Secret input — render as password text input
      setting.addText((text: TextComponent) => {
        text.inputEl.type = 'password'
        text.setValue(String(currentValue ?? ''))
        text.setDisabled(disabled)
        text.onChange((value: string) => {
          void tab.setControlValue(control.key, value)
        })
      })
      break
    }
  }
}
