/**
 * Settings context providing navigation state, dispatch, and registry
 * for the unified settings panel.
 */

import { createContext, useContext, useReducer, useEffect, useMemo, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { createSettingsReducer, initialSettingsState, type SettingsNavState, type SettingsAction } from './settingsState'
import { createSettingsRegistry, type ISettingsRegistry } from './settingsRegistry'
import { persistSettingsNav, restoreSettingsNav } from './settingsPersistence'

/** Context value shape exposing settings state, dispatch, and registry. */
export interface SettingsContextValue {
  /** Current navigation state. */
  state: SettingsNavState
  /** Dispatch function for settings actions. */
  dispatch: Dispatch<SettingsAction>
  /** Section registry instance for querying available sections. */
  registry: ISettingsRegistry
  /** List of vaults available for vault-specific settings. */
  vaults: Array<{ id: string; name: string }>
}

/** React Context for settings navigation state management. */
export const SettingsContext = createContext<SettingsContextValue | null>(null)

/** Props for the SettingsProvider component. */
export interface SettingsProviderProps {
  children: ReactNode
  isAdmin: boolean
  vaults: Array<{ id: string; name: string }>
}

/**
 * Provider component that wraps the settings panel with navigation state management.
 * Uses useReducer for predictable state transitions.
 * Navigation state is persisted in sessionStorage and restored on mount.
 */
export function SettingsProvider({ children, isAdmin, vaults }: SettingsProviderProps) {
  const settingsReducer = useMemo(() => createSettingsReducer(isAdmin), [isAdmin])
  const [state, dispatch] = useReducer(settingsReducer, initialSettingsState)

  const registry = useMemo(() => createSettingsRegistry(), [])

  // Restore persisted navigation state on mount
  useEffect(() => {
    const vaultIds = vaults.map((v) => v.id)
    const restored = restoreSettingsNav(isAdmin, vaultIds)
    if (restored !== null) {
      dispatch({ type: 'RESTORE_STATE', payload: restored })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist navigation state on every change
  useEffect(() => {
    persistSettingsNav(state)
  }, [state])

  return React.createElement(
    SettingsContext.Provider,
    { value: { state, dispatch, registry, vaults } },
    children,
  )
}

/**
 * Hook to access the SettingsContext. Throws if used outside SettingsProvider.
 */
export function useSettingsContext(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (context === null) {
    throw new Error('useSettingsContext must be used within a SettingsProvider')
  }
  return context
}
