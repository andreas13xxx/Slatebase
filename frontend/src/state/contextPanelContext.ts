/**
 * Context panel context and provider.
 * Manages the context panel state via useReducer and persists
 * layout (tab order, sections) to localStorage scoped by userId.
 */

import { createContext, useContext, useReducer, useEffect, useRef, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import {
  contextPanelReducer,
  createInitialState,
  generateSectionId,
  type ContextPanelState,
  type ContextPanelAction,
  type ContextPanelViewId,
  type SplitSection,
} from './contextPanelState'
import {
  saveContextPanelLayout,
  loadContextPanelLayout,
  type PersistedContextPanelLayout,
} from '../components/context-panel/utils/persistence'
import { useAuthContext } from './authContext'

/** Context value shape exposing context panel state and dispatch. */
export interface ContextPanelContextValue {
  state: ContextPanelState
  dispatch: Dispatch<ContextPanelAction>
}

/** React Context for context panel state management. */
export const ContextPanelContext = createContext<ContextPanelContextValue | null>(null)

/** Props for the ContextPanelProvider component. */
interface ContextPanelProviderProps {
  children: ReactNode
}

/** Debounce delay in milliseconds for persisting layout to localStorage. */
const PERSIST_DEBOUNCE_MS = 500

/**
 * Creates the initial state, applying persisted layout from localStorage if available.
 * Falls back to defaults if localStorage is unavailable or data is invalid.
 */
function createInitialStateWithPersistence(userId: string | null): ContextPanelState {
  const baseState = createInitialState()

  if (!userId) return baseState

  const persisted = loadContextPanelLayout(userId)
  if (!persisted) return baseState

  return applyPersistedLayout(baseState, persisted)
}

/**
 * All view IDs that should always be present.
 * Used for forward-compatibility migration when new views are added.
 */
const ALL_VIEW_IDS: ContextPanelViewId[] = ['outline', 'links', 'tags', 'properties', 'search']

/**
 * Applies a persisted layout to the base state.
 * Reconstructs sections with fresh IDs while preserving view assignments and heights.
 * Migrates old layouts by adding any missing view IDs to the first section and tabOrder.
 */
function applyPersistedLayout(
  baseState: ContextPanelState,
  persisted: PersistedContextPanelLayout
): ContextPanelState {
  // Migrate: add any new view IDs that are missing from the persisted layout
  const persistedViewIds = new Set<string>(persisted.tabOrder)
  const missingViewIds = ALL_VIEW_IDS.filter(id => !persistedViewIds.has(id))

  const migratedTabOrder = [...persisted.tabOrder as ContextPanelViewId[], ...missingViewIds]

  // Add missing view IDs to the first section
  const migratedSections = persisted.sections.map((s, i) => ({
    ...s,
    viewIds: i === 0
      ? [...s.viewIds as ContextPanelViewId[], ...missingViewIds]
      : s.viewIds as ContextPanelViewId[],
  }))

  const sections: SplitSection[] = migratedSections.map((s) => ({
    id: generateSectionId(),
    viewIds: s.viewIds,
    activeViewId: s.activeViewId as ContextPanelViewId,
    heightFraction: s.heightFraction,
  }))

  return {
    ...baseState,
    tabOrder: migratedTabOrder,
    sections,
  }
}

/**
 * Provider component that wraps children with context panel state management.
 * Uses useReducer for predictable state transitions.
 * Loads persisted layout from localStorage on mount and saves layout changes
 * to localStorage with a 500ms debounce to avoid excessive writes.
 * Accesses the current userId from AuthContext to scope persistence per user.
 */
export function ContextPanelProvider({ children }: ContextPanelProviderProps) {
  const { authState } = useAuthContext()
  const userId = authState.user?.userId ?? null

  const [state, dispatch] = useReducer(
    contextPanelReducer,
    userId,
    createInitialStateWithPersistence,
  )

  // Track whether the initial render has completed (skip first persist)
  const isFirstRenderRef = useRef(true)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced save to localStorage on layout state changes (sections, tabOrder)
  useEffect(() => {
    // Skip persisting on the initial render — we just loaded from localStorage
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }

    if (!userId) return

    // Clear any pending debounce timer
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      saveContextPanelLayout(userId, {
        tabOrder: state.tabOrder,
        sections: state.sections.map((s) => ({
          viewIds: s.viewIds,
          activeViewId: s.activeViewId,
          heightFraction: s.heightFraction,
        })),
      })
      debounceTimerRef.current = null
    }, PERSIST_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [userId, state.tabOrder, state.sections])

  return React.createElement(
    ContextPanelContext.Provider,
    { value: { state, dispatch } },
    children,
  )
}

/**
 * Hook to access the ContextPanelContext. Throws if used outside ContextPanelProvider.
 */
export function useContextPanelContext(): ContextPanelContextValue {
  const context = useContext(ContextPanelContext)
  if (context === null) {
    throw new Error('useContextPanelContext must be used within a ContextPanelProvider')
  }
  return context
}
