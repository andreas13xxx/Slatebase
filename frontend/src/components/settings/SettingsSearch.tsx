/**
 * Settings search input with debounced dispatch.
 *
 * Renders a text input with a search icon and clear button.
 * Local state provides responsive typing; after 150ms of inactivity,
 * the query is dispatched to the settings reducer via SET_SEARCH.
 * Clearing the field dispatches immediately (no debounce).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { SettingsAction } from '../../state/settingsState'
import './SettingsSearch.css'

/** Props for the SettingsSearch component. */
export interface SettingsSearchProps {
  /** Current search query from state (used for initial sync). */
  searchQuery: string
  /** Dispatch function for settings actions. */
  dispatch: React.Dispatch<SettingsAction>
}

/** Debounce delay in milliseconds. */
const DEBOUNCE_MS = 150

/**
 * Search input for filtering settings sections.
 *
 * - Controlled locally for responsive typing
 * - Dispatches SET_SEARCH after 150ms debounce
 * - Immediate dispatch on clear (empty string)
 * - Cleans up debounce timer on unmount
 */
export function SettingsSearch({ searchQuery, dispatch }: SettingsSearchProps) {
  const [localValue, setLocalValue] = useState(searchQuery)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local value when external state changes (e.g. RESTORE_STATE)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing controlled input with external prop
    setLocalValue(searchQuery)
  }, [searchQuery])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  const dispatchSearch = useCallback((query: string) => {
    dispatch({ type: 'SET_SEARCH', payload: { query } })
  }, [dispatch])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalValue(value)

    // Clear any pending debounce
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (value === '') {
      // Immediate dispatch on clear
      dispatchSearch('')
    } else {
      // Debounced dispatch
      timerRef.current = setTimeout(() => {
        dispatchSearch(value)
        timerRef.current = null
      }, DEBOUNCE_MS)
    }
  }, [dispatchSearch])

  const handleClear = useCallback(() => {
    setLocalValue('')
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    dispatchSearch('')
  }, [dispatchSearch])

  return (
    <div className="settings-search">
      <Search size={14} className="settings-search__icon" aria-hidden="true" />
      <input
        type="text"
        className="settings-search__input"
        placeholder="Einstellungen durchsuchen..."
        value={localValue}
        onChange={handleChange}
        aria-label="Einstellungen durchsuchen"
      />
      {localValue.length > 0 && (
        <button
          type="button"
          className="settings-search__clear"
          onClick={handleClear}
          aria-label="Suche leeren"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
