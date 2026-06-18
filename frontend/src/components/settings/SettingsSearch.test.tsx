import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SettingsSearch } from './SettingsSearch'

describe('SettingsSearch', () => {
  let dispatch: React.Dispatch<SettingsAction>

  beforeEach(() => {
    vi.useFakeTimers()
    dispatch = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders search input with placeholder', () => {
    render(<SettingsSearch searchQuery="" dispatch={dispatch} />)
    const input = screen.getByPlaceholderText('Einstellungen durchsuchen...')
    expect(input).toBeInTheDocument()
  })

  it('renders search icon', () => {
    render(<SettingsSearch searchQuery="" dispatch={dispatch} />)
    const icon = document.querySelector('.settings-search__icon')
    expect(icon).toBeInTheDocument()
  })

  it('does not show clear button when input is empty', () => {
    render(<SettingsSearch searchQuery="" dispatch={dispatch} />)
    expect(screen.queryByLabelText('Suche leeren')).not.toBeInTheDocument()
  })

  it('shows clear button when input has content', () => {
    render(<SettingsSearch searchQuery="test" dispatch={dispatch} />)
    expect(screen.getByLabelText('Suche leeren')).toBeInTheDocument()
  })

  it('dispatches SET_SEARCH after 150ms debounce on typing', () => {
    render(<SettingsSearch searchQuery="" dispatch={dispatch} />)
    const input = screen.getByPlaceholderText('Einstellungen durchsuchen...')

    fireEvent.change(input, { target: { value: 'pro' } })

    // Not dispatched yet
    expect(dispatch).not.toHaveBeenCalled()

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_SEARCH',
      payload: { query: 'pro' },
    })
  })

  it('does not dispatch before debounce completes', () => {
    render(<SettingsSearch searchQuery="" dispatch={dispatch} />)
    const input = screen.getByPlaceholderText('Einstellungen durchsuchen...')

    fireEvent.change(input, { target: { value: 'sync' } })

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('resets debounce timer on rapid input changes', () => {
    render(<SettingsSearch searchQuery="" dispatch={dispatch} />)
    const input = screen.getByPlaceholderText('Einstellungen durchsuchen...')

    fireEvent.change(input, { target: { value: 'p' } })
    act(() => {
      vi.advanceTimersByTime(100)
    })

    fireEvent.change(input, { target: { value: 'pr' } })
    act(() => {
      vi.advanceTimersByTime(100)
    })

    fireEvent.change(input, { target: { value: 'pro' } })
    act(() => {
      vi.advanceTimersByTime(150)
    })

    // Only one dispatch — with final value
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_SEARCH',
      payload: { query: 'pro' },
    })
  })

  it('dispatches immediately when field is cleared via typing', () => {
    render(<SettingsSearch searchQuery="test" dispatch={dispatch} />)
    const input = screen.getByPlaceholderText('Einstellungen durchsuchen...')

    fireEvent.change(input, { target: { value: '' } })

    // Immediate — no need to advance timers
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_SEARCH',
      payload: { query: '' },
    })
  })

  it('dispatches immediately when clear button is clicked', () => {
    render(<SettingsSearch searchQuery="sync" dispatch={dispatch} />)
    const clearBtn = screen.getByLabelText('Suche leeren')

    fireEvent.click(clearBtn)

    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_SEARCH',
      payload: { query: '' },
    })
  })

  it('clears input value when clear button is clicked', () => {
    render(<SettingsSearch searchQuery="sync" dispatch={dispatch} />)
    const clearBtn = screen.getByLabelText('Suche leeren')

    fireEvent.click(clearBtn)

    const input = screen.getByPlaceholderText('Einstellungen durchsuchen...')
    expect(input).toHaveValue('')
  })

  it('syncs local value when searchQuery prop changes', () => {
    const { rerender } = render(<SettingsSearch searchQuery="" dispatch={dispatch} />)
    const input = screen.getByPlaceholderText('Einstellungen durchsuchen...')

    expect(input).toHaveValue('')

    rerender(<SettingsSearch searchQuery="restored" dispatch={dispatch} />)
    expect(input).toHaveValue('restored')
  })

  it('has accessible aria-label on the input', () => {
    render(<SettingsSearch searchQuery="" dispatch={dispatch} />)
    expect(screen.getByLabelText('Einstellungen durchsuchen')).toBeInTheDocument()
  })

  it('cancels pending debounce if field is cleared before timer fires', () => {
    render(<SettingsSearch searchQuery="" dispatch={dispatch} />)
    const input = screen.getByPlaceholderText('Einstellungen durchsuchen...')

    // Type something — starts debounce
    fireEvent.change(input, { target: { value: 'admin' } })

    // Before debounce fires, clear the field
    fireEvent.change(input, { target: { value: '' } })

    // The immediate clear dispatch fires
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_SEARCH',
      payload: { query: '' },
    })

    // Advance past the original debounce — should NOT dispatch "admin"
    act(() => {
      vi.advanceTimersByTime(200)
    })

    // Only the immediate empty dispatch should have occurred
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})
