/**
 * Left/right side panel contexts and providers.
 * Both wrap the same generic `usePanelState` hook (reducer + localStorage
 * persistence, scoped by userId) — they only differ in their storage-key
 * prefix and default view set, so the two panels stay independent state
 * instances (and independently persisted layouts) while sharing one
 * implementation.
 */

import { createContext, useContext, useReducer, useEffect, useRef, type Dispatch, type ReactNode } from 'react'
import React from 'react'
import {
  panelReducer,
  createInitialState,
  generateSectionId,
  type PanelState,
  type PanelAction,
  type PanelViewId,
  type PanelSplitSection,
} from './panelState'
import {
  savePanelLayout,
  loadPanelLayout,
  type PersistedPanelLayout,
  type PanelSide,
} from '../components/side-panel/utils/persistence'
import { useAuthContext } from './authContext'

/** Context value shape exposing panel state and dispatch. */
export interface PanelContextValue {
  state: PanelState
  dispatch: Dispatch<PanelAction>
}

/** Debounce delay in milliseconds for persisting layout to localStorage. */
const PERSIST_DEBOUNCE_MS = 500

/**
 * Applies a persisted layout to the base state.
 * Reconstructs sections with fresh IDs while preserving view assignments and heights.
 * Migrates old layouts by adding any missing default view IDs to the first section and tabOrder.
 */
function applyPersistedLayout(
  baseState: PanelState,
  persisted: PersistedPanelLayout,
  defaultViewIds: PanelViewId[],
): PanelState {
  // Migrate: add any new default view IDs that are missing from the persisted layout
  const persistedViewIds = new Set<string>(persisted.tabOrder)
  const missingViewIds = defaultViewIds.filter(id => !persistedViewIds.has(id))

  const migratedTabOrder = [...persisted.tabOrder, ...missingViewIds]

  // Add missing view IDs to the first section
  const migratedSections = persisted.sections.map((s, i) => ({
    ...s,
    viewIds: i === 0 ? [...s.viewIds, ...missingViewIds] : s.viewIds,
  }))

  const sections: PanelSplitSection[] = migratedSections.map((s) => ({
    id: generateSectionId(),
    viewIds: s.viewIds,
    activeViewId: s.activeViewId,
    heightFraction: s.heightFraction,
  }))

  return {
    ...baseState,
    tabOrder: migratedTabOrder,
    sections,
  }
}

/**
 * Reducer + localStorage-persistence hook shared by both panel providers.
 * Loads persisted layout from localStorage on mount and saves layout changes
 * with a 500ms debounce to avoid excessive writes, scoped per user.
 */
function usePanelState(panel: PanelSide, defaultViewIds: PanelViewId[]): PanelContextValue {
  const { authState } = useAuthContext()
  const userId = authState.user?.userId ?? null

  const [state, dispatch] = useReducer(
    panelReducer,
    userId,
    (initialUserId): PanelState => {
      const baseState = createInitialState(defaultViewIds)
      if (!initialUserId) return baseState
      const persisted = loadPanelLayout(panel)
      if (!persisted) return baseState
      return applyPersistedLayout(baseState, persisted, defaultViewIds)
    },
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
      savePanelLayout(panel, {
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
  }, [userId, state.tabOrder, state.sections, panel])

  return { state, dispatch }
}

// ─── Left panel ────────────────────────────────────────────────────────────

const LEFT_DEFAULT_VIEW_IDS: PanelViewId[] = ['explorer', 'favorites', 'recent']

export const LeftPanelContext = createContext<PanelContextValue | null>(null)

export function LeftPanelProvider({ children }: { children: ReactNode }) {
  const value = usePanelState('sidebar', LEFT_DEFAULT_VIEW_IDS)
  return React.createElement(LeftPanelContext.Provider, { value }, children)
}

/** Hook to access the LeftPanelContext. Throws if used outside LeftPanelProvider. */
export function useLeftPanelContext(): PanelContextValue {
  const context = useContext(LeftPanelContext)
  if (context === null) {
    throw new Error('useLeftPanelContext must be used within a LeftPanelProvider')
  }
  return context
}

// ─── Right panel ───────────────────────────────────────────────────────────

const RIGHT_DEFAULT_VIEW_IDS: PanelViewId[] = ['outline', 'links', 'tags', 'properties', 'search']

export const RightPanelContext = createContext<PanelContextValue | null>(null)

export function RightPanelProvider({ children }: { children: ReactNode }) {
  const value = usePanelState('context', RIGHT_DEFAULT_VIEW_IDS)
  return React.createElement(RightPanelContext.Provider, { value }, children)
}

/** Hook to access the RightPanelContext. Throws if used outside RightPanelProvider. */
export function useRightPanelContext(): PanelContextValue {
  const context = useContext(RightPanelContext)
  if (context === null) {
    throw new Error('useRightPanelContext must be used within a RightPanelProvider')
  }
  return context
}

/**
 * Hook to access either panel's context by side — convenience for
 * side-agnostic components. Reads both contexts unconditionally (cheap,
 * and keeps this a normal, order-stable hook) and picks the one for `side`.
 */
export function usePanelContextForSide(side: 'left' | 'right'): PanelContextValue {
  const left = useContext(LeftPanelContext)
  const right = useContext(RightPanelContext)
  const value = side === 'left' ? left : right
  if (value === null) {
    throw new Error(`usePanelContextForSide('${side}') must be used within a ${side === 'left' ? 'LeftPanelProvider' : 'RightPanelProvider'}`)
  }
  return value
}
