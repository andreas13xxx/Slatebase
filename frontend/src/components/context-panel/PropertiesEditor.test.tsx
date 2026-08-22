import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertiesEditor } from './PropertiesEditor'
import type { PropertiesEditorProps } from './PropertiesEditor'

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
  it('shows a type dropdown reflecting the inferred type', () => {
    renderEditor({ data: { count: 5 } })
    expect(screen.getByRole('combobox', { name: 'Typ' })).toHaveValue('number')
  })

  it('calls onTypeChange when a different type is selected', async () => {
    const onTypeChange = vi.fn()
    renderEditor({ data: { title: 'Hello' }, onTypeChange })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Typ' }), 'checkbox')

    expect(onTypeChange).toHaveBeenCalledWith('title', 'checkbox')
  })
})
