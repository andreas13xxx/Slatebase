import { createContext, useContext, useReducer, useMemo, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { featureReducer, initialFeatureState, type FeatureState, type FeatureAction } from './featureState'

/** Context value shape exposing feature state, dispatch, and isEnabled helper. */
export interface FeatureContextValue {
  state: FeatureState
  dispatch: Dispatch<FeatureAction>
  /** Synchronous query whether a feature is enabled. Returns false for unknown features. */
  isEnabled: (featureName: string) => boolean
}

/** React Context for feature toggle state management. */
export const FeatureContext = createContext<FeatureContextValue | null>(null)

/** Props for the FeatureProvider component. */
interface FeatureProviderProps {
  children: ReactNode
}

/**
 * Provider component that wraps the application with feature toggle state management.
 * Uses useReducer for predictable feature state transitions.
 * Exposes an `isEnabled` helper that searches the feature list and returns false as default.
 */
export function FeatureProvider({ children }: FeatureProviderProps) {
  const [state, dispatch] = useReducer(featureReducer, initialFeatureState)

  const isEnabled = useMemo(() => {
    return (featureName: string): boolean => {
      const feature = state.features.find(f => f.name === featureName)
      return feature ? feature.enabled : false
    }
  }, [state.features])

  const value = useMemo<FeatureContextValue>(() => ({
    state,
    dispatch,
    isEnabled,
  }), [state, dispatch, isEnabled])

  return React.createElement(
    FeatureContext.Provider,
    { value },
    children,
  )
}

/**
 * Hook to access the FeatureContext. Throws if used outside FeatureProvider.
 */
export function useFeatureContext(): FeatureContextValue {
  const context = useContext(FeatureContext)
  if (context === null) {
    throw new Error('useFeatureContext must be used within a FeatureProvider')
  }
  return context
}
