/**
 * Built-in property type widgets of Obsidian's metadataTypeManager, rendered
 * with plain DOM and Obsidian's class names (`metadata-input`,
 * `multi-select-*`). Plugins call `widget.render(el, value, ctx)` on them —
 * Nested Properties draws every child value of an object through the widget
 * of its type — and may wrap or replace them. Each `render` builds the control,
 * reports edits through `ctx.onChange` and returns a handle with `focus()`.
 */

import { translateNow } from '../../i18n'

/** What a widget gets next to the element and value (Obsidian's `PropertyRenderContext`). */
export interface PropertyWidgetContext {
  app: unknown
  /** Hands the focus back to the row after an edit is done. */
  blur: () => void
  key: string
  onChange: (value: unknown) => void
  sourcePath: string
}

/** Handle `render` returns; plugins call `focus` to jump into the value. */
export interface PropertyWidgetHandle {
  type: string
  focus: (position?: 'start' | 'end') => void
}

/** A property type widget, as registered in `metadataTypeManager.registeredTypeWidgets`. */
export interface PropertyWidget {
  type: string
  icon: string
  name: () => string
  default: () => unknown
  validate: (value: unknown) => boolean
  render: (el: HTMLElement, value: unknown, ctx: PropertyWidgetContext) => PropertyWidgetHandle
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

/** Creates a child element with a class list (plain DOM: these widgets must not depend on Obsidian's createEl patches). */
function make<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  parent.appendChild(node)
  return node
}

const isStringList = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === 'string')

function focusInput(input: HTMLInputElement, position?: 'start' | 'end'): void {
  input.focus()
  if (position !== undefined && input.type === 'text') {
    const at = position === 'start' ? 0 : input.value.length
    input.setSelectionRange(at, at)
  }
}

/** Commits on `change` (blur / Enter), like the editor's own controls, so typing never re-renders under the cursor. */
function bindCommit(input: HTMLInputElement, ctx: PropertyWidgetContext, read: () => unknown): void {
  input.addEventListener('change', () => { ctx.onChange(read()) })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      input.blur()
      ctx.blur()
    }
  })
}

function renderInput(
  type: string,
  inputType: string,
  extraClass: string,
  toText: (value: unknown) => string,
  read: (input: HTMLInputElement) => unknown,
): PropertyWidget['render'] {
  return (el, value, ctx) => {
    const input = make(el, 'input', `metadata-input metadata-input-${extraClass}`)
    input.type = inputType
    input.value = toText(value)
    bindCommit(input, ctx, () => read(input))
    return { type, focus: (position) => { focusInput(input, position) } }
  }
}

/** Pill list shared by `multitext`, `tags` and `aliases`. */
function renderPills(type: string, normalize: (item: string) => string): PropertyWidget['render'] {
  return (el, value, ctx) => {
    let items: string[] = Array.isArray(value) ? value.map(String) : []
    const container = make(el, 'div', 'multi-select-container')
    const input = make(container, 'input', 'multi-select-input')
    input.type = 'text'

    const commit = (next: string[]): void => {
      items = next
      draw()
      ctx.onChange(items)
    }
    const add = (): void => {
      const text = normalize(input.value.trim())
      input.value = ''
      if (text !== '' && !items.includes(text)) commit([...items, text])
    }
    const draw = (): void => {
      for (const pill of container.querySelectorAll('.multi-select-pill')) pill.remove()
      for (const item of items) {
        const pill = document.createElement('div')
        pill.className = 'multi-select-pill'
        make(pill, 'div', 'multi-select-pill-content').textContent = item
        const remove = make(pill, 'button', 'multi-select-pill-remove-button')
        remove.type = 'button'
        remove.setAttribute('aria-label', item)
        remove.textContent = '×'
        remove.addEventListener('click', () => { commit(items.filter((other) => other !== item)) })
        container.insertBefore(pill, input)
      }
    }
    draw()

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        add()
      } else if (e.key === 'Backspace' && input.value === '' && items.length > 0) {
        commit(items.slice(0, -1))
      }
    })
    input.addEventListener('blur', add)
    return { type, focus: () => { input.focus() } }
  }
}

function localNow(): Date {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
}

const asText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function widget(
  type: string,
  icon: string,
  nameKey: Parameters<typeof translateNow>[0],
  defaultValue: () => unknown,
  validate: PropertyWidget['validate'],
  render: PropertyWidget['render'],
): PropertyWidget {
  return { type, icon, name: () => translateNow(nameKey), default: defaultValue, validate, render }
}

/** Builds the ten built-in widgets, keyed by type. A fresh set per manager, so identity marks them as built-in. */
export function createBuiltinPropertyWidgets(): Record<string, PropertyWidget> {
  const list = (type: string, icon: string, nameKey: Parameters<typeof translateNow>[0], normalize: (s: string) => string): PropertyWidget =>
    widget(type, icon, nameKey, () => [], isStringList, renderPills(type, normalize))
  return {
    text: widget('text', 'lucide-text', 'contextPanel.properties.types.text', () => '', (v) => typeof v === 'string',
      renderInput('text', 'text', 'text', asText, (i) => i.value)),
    multitext: list('multitext', 'lucide-list', 'contextPanel.properties.types.list', (s) => s),
    number: widget('number', 'lucide-binary', 'contextPanel.properties.types.number', () => 0, (v) => typeof v === 'number',
      renderInput('number', 'number', 'number', asText, (i) => (i.value === '' ? null : Number(i.value)))),
    checkbox: widget('checkbox', 'lucide-check-square', 'contextPanel.properties.types.checkbox', () => false, (v) => typeof v === 'boolean',
      (el, value, ctx) => {
        const input = make(el, 'input', 'metadata-input metadata-input-checkbox')
        input.type = 'checkbox'
        input.checked = value === true
        input.addEventListener('change', () => { ctx.onChange(input.checked) })
        return { type: 'checkbox', focus: () => { input.focus() } }
      }),
    date: widget('date', 'lucide-calendar', 'contextPanel.properties.types.date', () => localNow().toISOString().slice(0, 10),
      (v) => typeof v === 'string' && DATE_RE.test(v),
      renderInput('date', 'date', 'text mod-date', asText, (i) => i.value)),
    datetime: widget('datetime', 'lucide-clock', 'contextPanel.properties.types.datetime', () => localNow().toISOString().slice(0, 16),
      (v) => typeof v === 'string' && DATETIME_RE.test(v),
      renderInput('datetime', 'datetime-local', 'text mod-datetime', asText, (i) => i.value)),
    tags: list('tags', 'lucide-tags', 'contextPanel.properties.types.tags', (s) => s.replace(/^#/, '')),
    aliases: list('aliases', 'lucide-forward', 'contextPanel.properties.types.aliases', (s) => s),
    unknown: widget('unknown', 'lucide-file-question', 'contextPanel.properties.types.unknown', () => '', () => true,
      renderInput('unknown', 'text', 'text', asText, (i) => i.value)),
  }
}
