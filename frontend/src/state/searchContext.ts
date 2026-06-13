import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import { searchReducer, initialSearchState, type SearchState, type SearchAction } from './searchState'

/** Context value shape exposing search state and dispatch. */
export interface SearchContextValue {
  state: SearchState
  dispatch: Dispatch<SearchAction>
}

/** React Context for search state management. */
export const SearchContext = createContext<SearchContextValue | null>(null)

/** Props for the SearchProvider component. */
interface SearchProviderProps {
  children: ReactNode
}

/**
 * Provider component that wraps the search area with search state management.
 * Uses useReducer for predictable search state transitions.
 */
export function SearchProvider({ children }: SearchProviderProps) {
  const [state, dispatch] = useReducer(searchReducer, initialSearchState)

  return React.createElement(
    SearchContext.Provider,
    { value: { state, dispatch } },
    children,
  )
}

/**
 * Hook to access the SearchContext. Throws if used outside SearchProvider.
 */
export function useSearchContext(): SearchContextValue {
  const context = useContext(SearchContext)
  if (context === null) {
    throw new Error('useSearchContext must be used within a SearchProvider')
  }
  return context
}
