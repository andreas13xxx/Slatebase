/**
 * Sidebar panel context and provider.
 * Manages the sidebar panel state via useReducer and persists
 * layout (tab order, sections) to localStorage scoped by userId.
 */

import { createContext, useContext, useReducer, useEffect, useRef, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import {
  sidebarPanelReducer,
  createInitialState,
  generateSectionId,
  type SidebarPanelState,
  type SidebarPanelAction,
  type SidebarViewId,
  type SidebarSplitSection,
} from './sidebarPanelState'
import {
  saveSidebarPanelLayout,
  loadSidebarPanelLayout,
  type PersistedSidebarPanelLayout,
} from '../components/sidebar-panel/utils/persistence'
import { useAuthContext } from './authContext'

/** Context value shape exposing sidebar panel state and dispatch. */
export interface SidebarPanelContextValue {
  state: SidebarPanelState
  dispatch: Dispatch<SidebarPanelAction>
}

/** React Context for sidebar panel state management. */
export const SidebarPanelContext = createContext<SidebarPanelContextValue | null>(null)

/** Props for the SidebarPanelProvider component. */
interface SidebarPanelProviderProps {
  children: ReactNode
}

/** Debounce delay in milliseconds for persisting layout to localStorage. */
const PERSIST_DEBOUNCE_MS = 500

/**
 * Creates the initial state, applying persisted layout from localStorage if available.
 * Falls back to defaults if localStorage is unavailable or data is invalid.
 */
function createInitialStateWithPersistence(userId: string | null): SidebarPanelState {
  const baseState = createInitialState()

  if (!userId) return baseState

  const persisted = loadSidebarPanelLayout(userId)
  if (!persisted) return baseState

  return applyPersistedLayout(baseState, persisted)
}

/**
 * All view IDs that should always be present.
 * Used for forward-compatibility migration when new views are added.
 */
const ALL_VIEW_IDS: SidebarViewId[] = ['explorer', 'favorites', 'recent']

/**
 * Applies a persisted layout to the base state.
 * Reconstructs sections with fresh IDs while preserving view assignments and heights.
 * Migrates old layouts by adding any missing view IDs to the first section and tabOrder.
 */
function applyPersistedLayout(
  baseState: SidebarPanelState,
  persisted: PersistedSidebarPanelLayout
): SidebarPanelState {
  // Migrate: add any new view IDs that are missing from the persisted layout
  const persistedViewIds = new Set<string>(persisted.tabOrder)
  const missingViewIds = ALL_VIEW_IDS.filter(id => !persistedViewIds.has(id))

  const migratedTabOrder = [...persisted.tabOrder as SidebarViewId[], ...missingViewIds]

  // Add missing view IDs to the first section
  const migratedSections = persisted.sections.map((s, i) => ({
    ...s,
    viewIds: i === 0
      ? [...s.viewIds as SidebarViewId[], ...missingViewIds]
      : s.viewIds as SidebarViewId[],
  }))

  const sections: SidebarSplitSection[] = migratedSections.map((s) => ({
    id: generateSectionId(),
    viewIds: s.viewIds,
    activeViewId: s.activeViewId as SidebarViewId,
    heightFraction: s.heightFraction,
  }))

  return {
    ...baseState,
    tabOrder: migratedTabOrder,
    sections,
  }
}

/**
 * Provider component that wraps children with sidebar panel state management.
 * Uses useReducer for predictable state transitions.
 * Loads persisted layout from localStorage on mount and saves layout changes
 * to localStorage with a 500ms debounce to avoid excessive writes.
 */
export function SidebarPanelProvider({ children }: SidebarPanelProviderProps) {
  const { authState } = useAuthContext()
  const userId = authState.user?.userId ?? null

  const [state, dispatch] = useReducer(
    sidebarPanelReducer,
    userId,
    createInitialStateWithPersistence,
  )

  // Track whether the initial render has completed (skip first persist)
  const isFirstRenderRef = useRef(true)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced save to localStorage on layout state changes (sections, tabOrder)
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }

    if (!userId) return

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      saveSidebarPanelLayout(userId, {
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
    SidebarPanelContext.Provider,
    { value: { state, dispatch } },
    children,
  )
}

/**
 * Hook to access the SidebarPanelContext. Throws if used outside SidebarPanelProvider.
 */
export function useSidebarPanelContext(): SidebarPanelContextValue {
  const context = useContext(SidebarPanelContext)
  if (context === null) {
    throw new Error('useSidebarPanelContext must be used within a SidebarPanelProvider')
  }
  return context
}
