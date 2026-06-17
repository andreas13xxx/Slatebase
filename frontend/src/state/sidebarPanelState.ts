/**
 * Sidebar panel state management.
 * Manages split sections, tab ordering for the left sidebar panel
 * (File Explorer, Favorites, Recent Files).
 * Mirrors the Context Panel architecture for consistency.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of simultaneous split sections. */
export const MAX_SECTIONS = 3

/** Minimum height fraction per section (approximately 80px in a typical panel). */
export const MIN_HEIGHT_FRACTION = 0.1

// ─── Types ───────────────────────────────────────────────────────────────────

/** Identifiers for the sidebar panel views. */
export type SidebarViewId = 'explorer' | 'favorites' | 'recent'

/** A single split section within the sidebar panel. */
export interface SidebarSplitSection {
  id: string
  viewIds: SidebarViewId[]
  activeViewId: SidebarViewId
  /** Height as a fraction (0–1) of total panel body height. */
  heightFraction: number
}

/** Sidebar panel state. */
export interface SidebarPanelState {
  sections: SidebarSplitSection[]
  tabOrder: SidebarViewId[]
}

/** Action types for the sidebar panel reducer. */
export type SidebarPanelAction =
  | { type: 'SET_TAB_ORDER'; tabOrder: SidebarViewId[] }
  | { type: 'SET_ACTIVE_VIEW'; sectionId: string; viewId: SidebarViewId }
  | { type: 'SPLIT_VIEW'; viewId: SidebarViewId; targetSectionIndex: number }
  | { type: 'MERGE_SECTION'; sectionId: string; targetSectionId: string; viewId: SidebarViewId }
  | { type: 'MOVE_VIEW_TO_SECTION'; viewId: SidebarViewId; targetSectionId: string }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'RESIZE_SECTIONS'; heightFractions: number[] }

// ─── Section ID Generation ───────────────────────────────────────────────────

let sectionIdCounter = 0

/** Generates a unique section ID using a simple counter. */
export function generateSectionId(): string {
  sectionIdCounter += 1
  return `sidebar-section-${sectionIdCounter}`
}

/**
 * Resets the section ID counter. Only for testing purposes.
 * @internal
 */
export function resetSectionIdCounter(): void {
  sectionIdCounter = 0
}

// ─── Default Tab Order ───────────────────────────────────────────────────────

/** Default tab order for the sidebar panel. */
export const DEFAULT_TAB_ORDER: SidebarViewId[] = ['explorer', 'favorites', 'recent']

// ─── Initial State ───────────────────────────────────────────────────────────

/** Creates the initial sidebar panel state with a single section containing all views. */
export function createInitialState(): SidebarPanelState {
  return {
    sections: [
      {
        id: generateSectionId(),
        viewIds: ['explorer', 'favorites', 'recent'],
        activeViewId: 'explorer',
        heightFraction: 1,
      },
    ],
    tabOrder: [...DEFAULT_TAB_ORDER],
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Pure reducer handling all sidebar panel state transitions.
 */
export function sidebarPanelReducer(state: SidebarPanelState, action: SidebarPanelAction): SidebarPanelState {
  switch (action.type) {
    case 'SET_TAB_ORDER': {
      return {
        ...state,
        tabOrder: action.tabOrder,
      }
    }

    case 'SET_ACTIVE_VIEW': {
      const { sectionId, viewId } = action
      return {
        ...state,
        sections: state.sections.map((section) => {
          if (section.id !== sectionId) return section
          if (!section.viewIds.includes(viewId)) return section
          return {
            ...section,
            activeViewId: viewId,
          }
        }),
      }
    }

    case 'SPLIT_VIEW': {
      const { viewId, targetSectionIndex } = action

      if (state.sections.length >= MAX_SECTIONS) {
        return state
      }

      const sourceSection = state.sections.find((s) => s.viewIds.includes(viewId))
      if (!sourceSection) return state

      if (sourceSection.viewIds.length <= 1) return state

      const updatedSourceViewIds = sourceSection.viewIds.filter((v) => v !== viewId)
      const updatedSourceActiveView = sourceSection.activeViewId === viewId
        ? updatedSourceViewIds[0] ?? 'explorer'
        : sourceSection.activeViewId

      const newSection: SidebarSplitSection = {
        id: generateSectionId(),
        viewIds: [viewId],
        activeViewId: viewId,
        heightFraction: 0,
      }

      const newSections: SidebarSplitSection[] = []
      const insertIndex = Math.min(targetSectionIndex, state.sections.length)

      for (let i = 0; i <= state.sections.length; i++) {
        if (i === insertIndex) {
          newSections.push(newSection)
        }
        if (i < state.sections.length) {
          const section = state.sections[i]!
          if (section.id === sourceSection.id) {
            newSections.push({
              ...section,
              viewIds: updatedSourceViewIds,
              activeViewId: updatedSourceActiveView,
              heightFraction: 0,
            })
          } else {
            newSections.push({ ...section, heightFraction: 0 })
          }
        }
      }

      const equalFraction = 1 / newSections.length
      const redistributedSections = newSections.map((s) => ({
        ...s,
        heightFraction: equalFraction,
      }))

      return {
        ...state,
        sections: redistributedSections,
      }
    }

    case 'MERGE_SECTION': {
      const { sectionId, targetSectionId, viewId } = action

      const sourceSection = state.sections.find((s) => s.id === sectionId)
      const targetSection = state.sections.find((s) => s.id === targetSectionId)
      if (!sourceSection || !targetSection) return state

      if (!sourceSection.viewIds.includes(viewId)) return state

      const updatedSourceViewIds = sourceSection.viewIds.filter((v) => v !== viewId)
      const updatedTargetViewIds = [...targetSection.viewIds, viewId]

      let newSections: SidebarSplitSection[]

      if (updatedSourceViewIds.length === 0) {
        newSections = state.sections
          .filter((s) => s.id !== sectionId)
          .map((s) => {
            if (s.id === targetSectionId) {
              return {
                ...s,
                viewIds: updatedTargetViewIds,
                activeViewId: viewId,
              }
            }
            return s
          })

        const equalFraction = 1 / newSections.length
        newSections = newSections.map((s) => ({
          ...s,
          heightFraction: equalFraction,
        }))
      } else {
        const updatedSourceActiveView = sourceSection.activeViewId === viewId
          ? updatedSourceViewIds[0] ?? 'explorer'
          : sourceSection.activeViewId

        newSections = state.sections.map((s) => {
          if (s.id === sectionId) {
            return {
              ...s,
              viewIds: updatedSourceViewIds,
              activeViewId: updatedSourceActiveView,
            }
          }
          if (s.id === targetSectionId) {
            return {
              ...s,
              viewIds: updatedTargetViewIds,
              activeViewId: viewId,
            }
          }
          return s
        })
      }

      return {
        ...state,
        sections: newSections,
      }
    }

    case 'MOVE_VIEW_TO_SECTION': {
      const { viewId, targetSectionId } = action

      const sourceSection = state.sections.find((s) => s.viewIds.includes(viewId))
      const targetSection = state.sections.find((s) => s.id === targetSectionId)
      if (!sourceSection || !targetSection) return state

      if (sourceSection.id === targetSectionId) return state

      const updatedSourceViewIds = sourceSection.viewIds.filter((v) => v !== viewId)
      const updatedTargetViewIds = [...targetSection.viewIds, viewId]

      let newSections: SidebarSplitSection[]

      if (updatedSourceViewIds.length === 0) {
        newSections = state.sections
          .filter((s) => s.id !== sourceSection.id)
          .map((s) => {
            if (s.id === targetSectionId) {
              return {
                ...s,
                viewIds: updatedTargetViewIds,
                activeViewId: viewId,
              }
            }
            return s
          })

        const equalFraction = 1 / newSections.length
        newSections = newSections.map((s) => ({
          ...s,
          heightFraction: equalFraction,
        }))
      } else {
        const updatedSourceActiveView = sourceSection.activeViewId === viewId
          ? updatedSourceViewIds[0] ?? 'explorer'
          : sourceSection.activeViewId

        newSections = state.sections.map((s) => {
          if (s.id === sourceSection.id) {
            return {
              ...s,
              viewIds: updatedSourceViewIds,
              activeViewId: updatedSourceActiveView,
            }
          }
          if (s.id === targetSectionId) {
            return {
              ...s,
              viewIds: updatedTargetViewIds,
              activeViewId: viewId,
            }
          }
          return s
        })
      }

      return {
        ...state,
        sections: newSections,
      }
    }

    case 'REMOVE_SECTION': {
      const { sectionId } = action

      if (state.sections.length <= 1) return state

      const newSections = state.sections.filter((s) => s.id !== sectionId)

      const equalFraction = 1 / newSections.length
      const redistributedSections = newSections.map((s) => ({
        ...s,
        heightFraction: equalFraction,
      }))

      return {
        ...state,
        sections: redistributedSections,
      }
    }

    case 'RESIZE_SECTIONS': {
      const { heightFractions } = action

      if (heightFractions.length !== state.sections.length) return state

      const clamped = heightFractions.map((f) => Math.max(f, MIN_HEIGHT_FRACTION))
      const total = clamped.reduce((sum, f) => sum + f, 0)
      const normalized = clamped.map((f) => f / total)

      return {
        ...state,
        sections: state.sections.map((section, i) => ({
          ...section,
          heightFraction: normalized[i] ?? section.heightFraction,
        })),
      }
    }
  }
}
