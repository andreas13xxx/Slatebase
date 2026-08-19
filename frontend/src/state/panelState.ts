/**
 * Generic side-panel state management — shared by both the left and right
 * sidebar panels (`frontend/src/components/side-panel/SidePanel.tsx`).
 * Manages split sections and tab ordering only; document-derived data
 * (outline/links/tags/properties content) lives in `documentPanelData.ts`
 * instead, since it doesn't depend on which side currently hosts those views.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of simultaneous split sections. */
export const MAX_SECTIONS = 3

/** Minimum height fraction per section (approximately 80px in a typical panel). */
export const MIN_HEIGHT_FRACTION = 0.1

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * All built-in view identifiers, valid on either side. Which side a given
 * view starts on is just an initial-state default (`createInitialState`) —
 * any of these can be dragged to the other panel at runtime.
 */
export type BuiltinPanelViewId =
  | 'explorer' | 'favorites' | 'recent'
  | 'outline' | 'links' | 'tags' | 'properties' | 'search'

/** Plugin view identifiers use a `plugin:` prefix followed by the view type. */
export type PluginViewId = `plugin:${string}`

/** All panel view identifiers (built-in + plugin). */
export type PanelViewId = BuiltinPanelViewId | PluginViewId

/** Type guard: checks if a view ID is a plugin view. */
export function isPluginViewId(viewId: string): viewId is PluginViewId {
  return viewId.startsWith('plugin:')
}

/** Type guard: checks if a view ID is a built-in view. */
export function isBuiltinViewId(viewId: string): viewId is BuiltinPanelViewId {
  return (
    viewId === 'explorer' || viewId === 'favorites' || viewId === 'recent' ||
    viewId === 'outline' || viewId === 'links' || viewId === 'tags' ||
    viewId === 'properties' || viewId === 'search'
  )
}

/** Extract the plugin view type from a PluginViewId. */
export function getPluginViewType(viewId: PluginViewId): string {
  return viewId.slice(7) // Remove 'plugin:' prefix
}

/** A single split section within a panel. */
export interface PanelSplitSection {
  id: string
  viewIds: PanelViewId[]
  activeViewId: PanelViewId
  /** Height as a fraction (0–1) of total panel body height. */
  heightFraction: number
}

/** Panel state (layout only — no document-derived data). */
export interface PanelState {
  sections: PanelSplitSection[]
  tabOrder: PanelViewId[]
}

/** Action types for the panel reducer. */
export type PanelAction =
  | { type: 'SET_TAB_ORDER'; sectionId: string; viewIds: PanelViewId[] }
  | { type: 'SET_ACTIVE_VIEW'; sectionId: string; viewId: PanelViewId }
  | { type: 'SPLIT_VIEW'; viewId: PanelViewId; targetSectionIndex: number }
  | { type: 'MERGE_SECTION'; sectionId: string; targetSectionId: string; viewId: PanelViewId }
  | { type: 'MOVE_VIEW_TO_SECTION'; viewId: PanelViewId; targetSectionId: string }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'RESIZE_SECTIONS'; heightFractions: number[] }
  | { type: 'ADD_VIEW'; viewId: PanelViewId }
  | { type: 'REMOVE_VIEW'; viewId: PanelViewId }

// ─── Section ID Generation ───────────────────────────────────────────────────

let sectionIdCounter = 0

/** Generates a unique section ID using a simple counter. */
export function generateSectionId(): string {
  sectionIdCounter += 1
  return `panel-section-${sectionIdCounter}`
}

/**
 * Resets the section ID counter. Only for testing purposes.
 * @internal
 */
export function resetSectionIdCounter(): void {
  sectionIdCounter = 0
}

// ─── Initial State ───────────────────────────────────────────────────────────

/**
 * Creates the initial panel state with a single section containing the given
 * default views. Left and right panels pass different `defaultViewIds` —
 * that's the only place a "side" is baked in; from there on, any view can
 * move freely between panels.
 */
export function createInitialState(defaultViewIds: PanelViewId[]): PanelState {
  return {
    sections: [
      {
        id: generateSectionId(),
        viewIds: [...defaultViewIds],
        activeViewId: defaultViewIds[0]!,
        heightFraction: 1,
      },
    ],
    tabOrder: [...defaultViewIds],
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Pure reducer handling all panel layout state transitions. Shared by both
 * the left and right panel — identical mechanics regardless of which side's
 * views happen to be flowing through it.
 */
export function panelReducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case 'SET_TAB_ORDER': {
      // Drag-reorder within a section reorders that section's own `viewIds`
      // (what the tab bar actually renders) — `tabOrder` alone was a stale
      // flat field nothing read for display, only used for the persisted-
      // layout migration check below, so it's kept in sync here as a
      // derived concatenation of all sections' viewIds in section order.
      const { sectionId, viewIds } = action
      const newSections = state.sections.map((section) =>
        section.id === sectionId ? { ...section, viewIds } : section
      )
      return {
        ...state,
        sections: newSections,
        tabOrder: newSections.flatMap((section) => section.viewIds),
      }
    }

    case 'SET_ACTIVE_VIEW': {
      const { sectionId, viewId } = action
      return {
        ...state,
        sections: state.sections.map((section) => {
          if (section.id !== sectionId) return section
          // Only switch if the view is actually in this section
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

      // Enforce max 3 sections invariant — no-op if already at max
      if (state.sections.length >= MAX_SECTIONS) {
        return state
      }

      // Find the source section that contains this view
      const sourceSection = state.sections.find((s) => s.viewIds.includes(viewId))
      if (!sourceSection) return state

      // Don't split if the source section only has one view (would leave it empty)
      if (sourceSection.viewIds.length <= 1) return state

      // Remove the view from the source section
      const updatedSourceViewIds = sourceSection.viewIds.filter((v) => v !== viewId)
      const updatedSourceActiveView = sourceSection.activeViewId === viewId
        ? updatedSourceViewIds[0]!
        : sourceSection.activeViewId

      // Create the new section with the split view
      const newSection: PanelSplitSection = {
        id: generateSectionId(),
        viewIds: [viewId],
        activeViewId: viewId,
        heightFraction: 0, // will be recalculated below
      }

      // Build new sections array with the new section inserted at the target index
      const newSections: PanelSplitSection[] = []
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
              heightFraction: 0, // will be recalculated below
            })
          } else {
            newSections.push({ ...section, heightFraction: 0 }) // will be recalculated below
          }
        }
      }

      // Equal height redistribution
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

      // Find source and target sections
      const sourceSection = state.sections.find((s) => s.id === sectionId)
      const targetSection = state.sections.find((s) => s.id === targetSectionId)
      if (!sourceSection || !targetSection) return state

      // Verify the view is in the source section
      if (!sourceSection.viewIds.includes(viewId)) return state

      // Remove the view from the source section
      const updatedSourceViewIds = sourceSection.viewIds.filter((v) => v !== viewId)

      // Add the view to the target section
      const updatedTargetViewIds = [...targetSection.viewIds, viewId]

      // Build new sections
      let newSections: PanelSplitSection[]

      if (updatedSourceViewIds.length === 0) {
        // Source section is now empty — remove it and redistribute height equally
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

        // Equal height redistribution among remaining sections
        const equalFraction = 1 / newSections.length
        newSections = newSections.map((s) => ({
          ...s,
          heightFraction: equalFraction,
        }))
      } else {
        // Source section still has views — just move the view
        const updatedSourceActiveView = sourceSection.activeViewId === viewId
          ? updatedSourceViewIds[0]!
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

      // Find the source section that contains this view
      const sourceSection = state.sections.find((s) => s.viewIds.includes(viewId))
      const targetSection = state.sections.find((s) => s.id === targetSectionId)
      if (!sourceSection || !targetSection) return state

      // Don't move if already in the target section
      if (sourceSection.id === targetSectionId) return state

      // Remove the view from the source section
      const updatedSourceViewIds = sourceSection.viewIds.filter((v) => v !== viewId)

      // Add the view to the target section
      const updatedTargetViewIds = [...targetSection.viewIds, viewId]

      // Build new sections
      let newSections: PanelSplitSection[]

      if (updatedSourceViewIds.length === 0) {
        // Source section is now empty — remove it and redistribute height equally
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

        // Equal height redistribution among remaining sections
        const equalFraction = 1 / newSections.length
        newSections = newSections.map((s) => ({
          ...s,
          heightFraction: equalFraction,
        }))
      } else {
        // Source section still has views — just move the view
        const updatedSourceActiveView = sourceSection.activeViewId === viewId
          ? updatedSourceViewIds[0]!
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

      // Don't remove the last section
      if (state.sections.length <= 1) return state

      // Remove the section
      const newSections = state.sections.filter((s) => s.id !== sectionId)

      // Equal height redistribution among remaining sections
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

      // Must match the number of sections
      if (heightFractions.length !== state.sections.length) return state

      // Clamp each fraction to the minimum and normalize so they sum to 1
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

    case 'ADD_VIEW': {
      const { viewId } = action

      // Don't add if already present in any section
      const alreadyPresent = state.sections.some(s => s.viewIds.includes(viewId))
      if (alreadyPresent) return state

      // Add to the first section's viewIds
      const firstSection = state.sections[0]
      if (!firstSection) return state

      return {
        ...state,
        sections: state.sections.map((section, index) =>
          index === 0
            ? { ...section, viewIds: [...section.viewIds, viewId] }
            : section
        ),
        tabOrder: [...state.tabOrder, viewId],
      }
    }

    case 'REMOVE_VIEW': {
      const { viewId } = action

      // Remove from all sections and fix activeViewId if needed. The
      // fallback below (`?? viewId`) is only reached when the section became
      // empty (updatedViewIds.length === 0) — that section is then dropped
      // by the `nonEmptySections` filter just below, so the placeholder
      // value is never actually rendered, just needs to satisfy the type.
      let newSections = state.sections.map(section => {
        if (!section.viewIds.includes(viewId)) return section
        const updatedViewIds = section.viewIds.filter(v => v !== viewId)
        const activeViewId = section.activeViewId === viewId
          ? (updatedViewIds[0] ?? viewId)
          : section.activeViewId
        return { ...section, viewIds: updatedViewIds, activeViewId }
      })

      // Remove any sections that became empty (but keep at least one)
      const nonEmptySections = newSections.filter(s => s.viewIds.length > 0)
      if (nonEmptySections.length > 0) {
        const equalFraction = 1 / nonEmptySections.length
        newSections = nonEmptySections.map(s => ({ ...s, heightFraction: equalFraction }))
      } else {
        // All sections empty — fall back to whatever views remain in
        // tabOrder (built-ins the user hasn't moved away, other plugin
        // views), or an empty section if truly nothing is left.
        const remaining = state.tabOrder.filter(v => v !== viewId)
        newSections = [{
          id: generateSectionId(),
          viewIds: remaining,
          activeViewId: remaining[0] ?? viewId,
          heightFraction: 1,
        }]
      }

      return {
        ...state,
        sections: newSections,
        tabOrder: state.tabOrder.filter(v => v !== viewId),
      }
    }
  }
}
