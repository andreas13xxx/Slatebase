import { describe, it, expect, vi } from 'vitest'
import { createMetadataTypeManager } from './metadata-type-manager'
import type { PropertyWidget } from './property-widgets'
import { withPluginContext } from './plugin-execution-context'

const ctxFor = (onChange: (v: unknown) => void) => ({ app: null, blur: () => {}, key: 'k', onChange, sourcePath: 'n.md' })

describe('metadataTypeManager', () => {
  it('attributes a widget a plugin returns from a patched getTypeInfo to that plugin', () => {
    const m = createMetadataTypeManager()
    const objectWidget: PropertyWidget = { ...m.getWidget('text')!, type: 'object' }
    const original = m.getTypeInfo
    withPluginContext('nested-properties', () => {
      m.getTypeInfo = (property: string, value: unknown) => {
        const info = original(property, value)
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) info.expected = objectWidget
        return info
      }
    })
    expect(m.getTypeInfo('a', { b: 1 }).expected).toBe(objectWidget)
    expect(m.getWidgetOwner(objectWidget)).toBe('nested-properties')
    expect(m.getWidgetOwner(m.getWidget('text')!)).toBeNull()
  })

  it('infers widgets from the value shape', () => {
    const m = createMetadataTypeManager()
    expect(m.getTypeInfo('x', true).inferred?.type).toBe('checkbox')
    expect(m.getTypeInfo('x', 2024).inferred?.type).toBe('number')
    expect(m.getTypeInfo('x', '2024-01-02').inferred?.type).toBe('date')
    expect(m.getTypeInfo('x', '2024-01-02T10:00').inferred?.type).toBe('datetime')
    expect(m.getTypeInfo('x', ['a']).inferred?.type).toBe('multitext')
    expect(m.getTypeInfo('x', { a: 1 }).inferred?.type).toBe('unknown')
    expect(m.getTypeInfo('x', ['a', 1]).inferred?.type).toBe('unknown')
  })

  it('returns the assigned type as a string and prefers it for `expected`', () => {
    const m = createMetadataTypeManager()
    expect(m.getAssignedWidget('tags')).toBe('tags')
    m.setType('Due', 'date')
    expect(m.getAssignedWidget('due')).toBe('date')
    expect(m.getTypeInfo('due', 'soon').expected?.type).toBe('date')
    m.unsetType('due')
    expect(m.getAssignedWidget('due')).toBeNull()
  })

  it('lets the vault registry assign types below plugin assignments', () => {
    const m = createMetadataTypeManager()
    m.setVaultTypes([{ key: 'Status', type: 'list' }])
    expect(m.getAssignedWidget('status')).toBe('multitext')
    m.setType('status', 'text')
    expect(m.getAssignedWidget('status')).toBe('text')
  })

  it('tells built-in widgets from replaced ones and notifies on registration', async () => {
    const m = createMetadataTypeManager()
    const listener = vi.fn()
    m.onChange(listener)
    const original = m.registeredTypeWidgets['text'] as PropertyWidget
    expect(m.isBuiltinWidget(original)).toBe(true)
    const wrapper: PropertyWidget = { ...original, render: (el, v, c) => original.render(el, v, c) }
    m.registeredTypeWidgets['text'] = wrapper
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(m.isBuiltinWidget(m.getTypeInfo('x', 'a').expected)).toBe(false)
  })

  it('validates values per widget', () => {
    const w = createMetadataTypeManager().registeredTypeWidgets
    expect(w['number']?.validate(3)).toBe(true)
    expect(w['number']?.validate('3')).toBe(false)
    expect(w['date']?.validate('2024-01-02')).toBe(true)
    expect(w['multitext']?.validate(['a', 1])).toBe(false)
    expect(w['checkbox']?.validate(false)).toBe(true)
  })

  it('renders built-in widgets that report edits through ctx.onChange', () => {
    const w = createMetadataTypeManager().registeredTypeWidgets
    const onChange = vi.fn()

    const textHost = document.createElement('div')
    const handle = w['text']!.render(textHost, 'a', ctxFor(onChange))
    const input = textHost.querySelector('input')!
    expect(input.value).toBe('a')
    input.value = 'b'
    input.dispatchEvent(new Event('change'))
    expect(onChange).toHaveBeenLastCalledWith('b')
    expect(handle.type).toBe('text')

    const checkHost = document.createElement('div')
    w['checkbox']!.render(checkHost, false, ctxFor(onChange))
    const box = checkHost.querySelector('input')!
    box.checked = true
    box.dispatchEvent(new Event('change'))
    expect(onChange).toHaveBeenLastCalledWith(true)

    const listHost = document.createElement('div')
    w['multitext']!.render(listHost, ['x'], ctxFor(onChange))
    expect(listHost.querySelectorAll('.multi-select-pill')).toHaveLength(1)
    const field = listHost.querySelector<HTMLInputElement>('.multi-select-input')!
    field.value = 'y'
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onChange).toHaveBeenLastCalledWith(['x', 'y'])
  })
})
