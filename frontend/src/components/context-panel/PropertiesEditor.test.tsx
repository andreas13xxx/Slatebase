import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertiesEditor } from './PropertiesEditor'
import type { PropertiesEditorProps } from './PropertiesEditor'
import { getMetadataTypeManager } from '../../plugins/compat/metadata-type-manager'
import type { PropertyWidget } from '../../plugins/compat/property-widgets'

function renderEditor(overrides: Partial<PropertiesEditorProps> = {}) {
  const props: PropertiesEditorProps = {
    data: { title: 'Hello' },
    parseError: null,
    rawFrontmatter: null,
    typeRegistry: null,
    onCommit: vi.fn(),
    onAddProperty: vi.fn(),
    onDeleteProperty: vi.fn(),
    onRenameProperty: vi.fn(),
    onTypeChange: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<PropertiesEditor {...props} />) }
}

describe('PropertiesEditor — key renaming', () => {
  it('shows the property key as a clickable button, not an input, by default', () => {
    renderEditor()
    expect(screen.getByRole('button', { name: 'title' })).toBeInTheDocument()
  })

  it('switches the key to an editable input when clicked', async () => {
    renderEditor()
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    expect(screen.getByRole('textbox', { name: 'Name der Eigenschaft' })).toHaveValue('title')
  })

  it('commits a rename on Enter', async () => {
    const onRenameProperty = vi.fn()
    renderEditor({ onRenameProperty })
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    const input = screen.getByRole('textbox', { name: 'Name der Eigenschaft' })
    await userEvent.clear(input)
    await userEvent.type(input, 'heading{Enter}')

    expect(onRenameProperty).toHaveBeenCalledWith('title', 'heading')
  })

  it('commits a rename on blur', async () => {
    const onRenameProperty = vi.fn()
    renderEditor({ onRenameProperty })
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    const input = screen.getByRole('textbox', { name: 'Name der Eigenschaft' })
    await userEvent.clear(input)
    await userEvent.type(input, 'heading')
    await userEvent.tab()

    expect(onRenameProperty).toHaveBeenCalledWith('title', 'heading')
  })

  it('commits an in-progress rename when the row is unmounted without a blur', async () => {
    // Same reason as the value controls: a change elsewhere in the document
    // rebuilds this editor, and React fires no blur on unmount — so the new
    // key would be lost while the row was still showing it.
    const onRenameProperty = vi.fn()
    const { unmount } = renderEditor({ onRenameProperty })
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    const input = screen.getByRole('textbox', { name: 'Name der Eigenschaft' })
    await userEvent.clear(input)
    await userEvent.type(input, 'heading')

    unmount()
    await act(async () => {})

    expect(onRenameProperty).toHaveBeenCalledWith('title', 'heading')
  })

  it('cancels on Escape without renaming', async () => {
    const onRenameProperty = vi.fn()
    renderEditor({ onRenameProperty })
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    const input = screen.getByRole('textbox', { name: 'Name der Eigenschaft' })
    await userEvent.type(input, ' extra{Escape}')

    expect(onRenameProperty).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'title' })).toBeInTheDocument()
  })

  it('does not rename to an empty key', async () => {
    const onRenameProperty = vi.fn()
    renderEditor({ onRenameProperty })
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    const input = screen.getByRole('textbox', { name: 'Name der Eigenschaft' })
    await userEvent.clear(input)
    await userEvent.keyboard('{Enter}')

    expect(onRenameProperty).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'title' })).toBeInTheDocument()
  })

  it('does not rename to a key that already exists', async () => {
    const onRenameProperty = vi.fn()
    renderEditor({ data: { title: 'Hello', tags: ['a'] }, onRenameProperty })
    await userEvent.click(screen.getByRole('button', { name: 'title' }))
    const input = screen.getByRole('textbox', { name: 'Name der Eigenschaft' })
    await userEvent.clear(input)
    await userEvent.type(input, 'tags{Enter}')

    expect(onRenameProperty).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'title' })).toBeInTheDocument()
  })

  it('opens a newly added property already in rename-edit mode', async () => {
    const onAddProperty = vi.fn()
    const { rerender, props } = renderEditor({ data: {}, onAddProperty })
    await userEvent.click(screen.getByRole('button', { name: 'Eigenschaft hinzufügen' }))

    expect(onAddProperty).toHaveBeenCalledWith('property', '')
    rerender(<PropertiesEditor {...props} data={{ property: '' }} />)

    expect(screen.getByRole('textbox', { name: 'Name der Eigenschaft' })).toHaveValue('property')
  })
})

describe('PropertiesEditor — type selection', () => {
  it('opens the type menu from the property icon, with the current type checked', async () => {
    renderEditor({ data: { count: 5 } })
    expect(screen.queryByRole('combobox')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Typ' }))
    expect(screen.getByRole('menuitemcheckbox', { name: /Zahl/ })).toBeInTheDocument()
  })

  it('calls onTypeChange when a type is picked from the menu', async () => {
    const onTypeChange = vi.fn()
    renderEditor({ data: { title: 'Hello' }, onTypeChange })
    await userEvent.click(screen.getByRole('button', { name: 'Typ' }))
    await userEvent.click(screen.getByText('Checkbox'))

    expect(onTypeChange).toHaveBeenCalledWith('title', 'checkbox')
  })
})

describe('PropertiesEditor — readOnly', () => {
  it('offers no adding, renaming, deleting or type change', () => {
    renderEditor({ data: { title: 'Hello' }, readOnly: true })
    expect(screen.queryByRole('button', { name: 'title' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Typ' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Eigenschaft hinzufügen/ })).toBeNull()
    expect(screen.queryByTitle('Eigenschaft entfernen')).toBeNull()
    expect(screen.getByText('title')).toBeInTheDocument()
  })

  it('disables the value controls', () => {
    renderEditor({ data: { title: 'Hello' }, readOnly: true })
    expect(document.querySelector('.properties-editor__list')).toBeDisabled()
  })
})

describe('PropertiesEditor - nested values and plugin widgets', () => {
  it('shows a nested object as editable YAML instead of [object Object]', () => {
    renderEditor({ data: { meta: { a: { b: 1 } } } })
    const area = screen.getByRole('textbox', { name: 'Verschachtelter Wert (YAML)' })
    expect(area).toHaveValue('a:\n  b: 1')
  })

  it('commits edited YAML of a nested value as data', async () => {
    const onCommit = vi.fn()
    renderEditor({ data: { meta: { a: 1 } }, onCommit })
    const area = screen.getByRole('textbox', { name: 'Verschachtelter Wert (YAML)' })
    await userEvent.clear(area)
    await userEvent.type(area, 'z: 2')
    await userEvent.tab()
    expect(onCommit).toHaveBeenCalledWith('meta', { z: 2 })
  })

  it('draws a plugin-registered widget through render() and forwards ctx.onChange', async () => {
    const manager = getMetadataTypeManager()
    const widget: PropertyWidget = {
      type: 'object',
      icon: 'lucide-braces',
      name: () => 'Object',
      default: () => ({}),
      validate: (v) => typeof v === 'object',
      render: (el, value, ctx) => {
        const b = document.createElement('button')
        b.textContent = `custom:${ctx.key}:${JSON.stringify(value)}`
        b.addEventListener('click', () => { ctx.onChange({ replaced: true }) })
        el.appendChild(b)
        return { type: 'object', focus: () => {} }
      },
    }
    manager.registeredTypeWidgets['object'] = widget
    const original = manager.getTypeInfo
    manager.getTypeInfo = (key, value) => {
      const info = original(key, value)
      if (info.inferred?.type === 'unknown' && value !== null && typeof value === 'object') return { inferred: widget, expected: widget }
      return info
    }
    try {
      const onCommit = vi.fn()
      renderEditor({ data: { meta: { a: 1 } }, onCommit, sourcePath: 'n.md' })
      await userEvent.click(screen.getByRole('button', { name: 'custom:meta:{"a":1}' }))
      expect(onCommit).toHaveBeenCalledWith('meta', { replaced: true })
      expect(document.querySelector('.metadata-property[data-property-key="meta"]')).not.toBeNull()
    } finally {
      manager.getTypeInfo = original
      delete manager.registeredTypeWidgets['object']
    }
  })
})
