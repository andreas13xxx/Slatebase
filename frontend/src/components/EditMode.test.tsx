import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { EditMode, type EditModeProps } from './EditMode'

/** Helper to render EditMode with default props and optional overrides. */
function renderEditMode(overrides: Partial<EditModeProps> = {}) {
  const defaultProps: EditModeProps = {
    content: 'Hello World',
    onChange: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    saving: false,
    error: null,
    ...overrides,
  }

  const result = render(React.createElement(EditMode, defaultProps))
  return { props: defaultProps, ...result }
}

describe('EditMode', () => {
  it('renders a textarea with the provided content (Req 4.1)', () => {
    renderEditMode({ content: '# Markdown content' })

    const textarea = screen.getByRole('textbox', { name: 'Dateiinhalt bearbeiten' })
    expect(textarea).toBeInTheDocument()
    expect(textarea).toHaveValue('# Markdown content')
  })

  it('calls onChange when the user types in the textarea (Req 4.3)', async () => {
    const onChange = vi.fn()
    renderEditMode({ content: '', onChange })

    const user = userEvent.setup()
    const textarea = screen.getByRole('textbox', { name: 'Dateiinhalt bearbeiten' })
    await user.type(textarea, 'a')

    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('auto-saves after debounce period when content changes', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn()
    renderEditMode({ onSave })

    const textarea = screen.getByRole('textbox', { name: 'Dateiinhalt bearbeiten' })

    // Simulate typing by firing change event directly
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )!.set!
      nativeInputValueSetter.call(textarea, 'Hello World x')
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Should not save immediately
    expect(onSave).not.toHaveBeenCalled()

    // Advance past debounce (1.5s)
    act(() => {
      vi.advanceTimersByTime(1600)
    })

    expect(onSave).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('shows "Ungespeicherte Änderungen" status after typing', async () => {
    renderEditMode()

    const textarea = screen.getByRole('textbox', { name: 'Dateiinhalt bearbeiten' })

    // Simulate typing
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )!.set!
      nativeInputValueSetter.call(textarea, 'Hello World x')
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(screen.getByRole('status')).toHaveTextContent('Ungespeicherte Änderungen')
  })

  it('disables textarea during saving state', () => {
    renderEditMode({ saving: true })

    const textarea = screen.getByRole('textbox', { name: 'Dateiinhalt bearbeiten' })
    expect(textarea).toBeDisabled()
  })

  it('shows "Speichern…" status during saving state', () => {
    const { rerender } = render(
      React.createElement(EditMode, {
        content: 'text',
        onChange: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
        saving: false,
        error: null,
      }),
    )

    // Start saving
    rerender(
      React.createElement(EditMode, {
        content: 'text',
        onChange: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
        saving: true,
        error: null,
      }),
    )

    expect(screen.getByRole('status')).toHaveTextContent('Speichern…')
  })

  it('shows success confirmation after save completes without error', () => {
    const { rerender } = render(
      React.createElement(EditMode, {
        content: 'text',
        onChange: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
        saving: true,
        error: null,
      }),
    )

    // Transition: saving true → false, no error = success
    rerender(
      React.createElement(EditMode, {
        content: 'text',
        onChange: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
        saving: false,
        error: null,
      }),
    )

    const successMsg = screen.getByRole('status')
    expect(successMsg).toHaveTextContent('Gespeichert')
  })

  it('shows error status on save failure (Req 4.5)', () => {
    const { rerender } = render(
      React.createElement(EditMode, {
        content: 'text',
        onChange: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
        saving: true,
        error: null,
      }),
    )

    // Transition: saving true → false, with error
    rerender(
      React.createElement(EditMode, {
        content: 'text',
        onChange: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
        saving: false,
        error: 'Netzwerkfehler',
      }),
    )

    const errorMsg = screen.getByRole('alert')
    expect(errorMsg).toHaveTextContent('Netzwerkfehler')
  })

  it('preserves content in textarea when error is shown (Req 4.5)', () => {
    renderEditMode({ content: 'Unsaved changes', error: 'Server error' })

    const textarea = screen.getByRole('textbox', { name: 'Dateiinhalt bearbeiten' })
    expect(textarea).toHaveValue('Unsaved changes')
  })

  it('supports Ctrl+S keyboard shortcut for immediate save', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn()
    renderEditMode({ onSave })

    const textarea = screen.getByRole('textbox', { name: 'Dateiinhalt bearbeiten' })
    textarea.focus()

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
      }))
    })

    expect(onSave).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('hides success message after timeout', async () => {
    vi.useFakeTimers()

    const { rerender } = render(
      React.createElement(EditMode, {
        content: 'text',
        onChange: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
        saving: true,
        error: null,
      }),
    )

    rerender(
      React.createElement(EditMode, {
        content: 'text',
        onChange: vi.fn(),
        onSave: vi.fn(),
        onCancel: vi.fn(),
        saving: false,
        error: null,
      }),
    )

    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2100)
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    vi.useRealTimers()
  })
})
