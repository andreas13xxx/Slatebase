/**
 * Context panel state management.
 * Manages split sections, tab ordering, and view-specific data
 * for the right-side context panel (Outline, Links, Tags, Properties).
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of simultaneous split sections. */
export const MAX_SECTIONS = 3

/** Minimum height fraction per section (approximately 80px in a typical panel). */
export const MIN_HEIGHT_FRACTION = 0.1

// ─── Types ───────────────────────────────────────────────────────────────────

/** Built-in identifiers for the context panel views. */
export type BuiltinViewId = 'outline' | 'links' | 'tags' | 'properties' | 'search'

/** Plugin view identifiers use a `plugin:` prefix followed by the view type. */
export type PluginViewId = `plugin:${string}`

/** All context panel view identifiers (built-in + plugin). */
export type ContextPanelViewId = BuiltinViewId | PluginViewId

/** Type guard: checks if a view ID is a plugin view. */
export function isPluginViewId(viewId: string): viewId is PluginViewId {
  return viewId.startsWith('plugin:')
}

/** Type guard: checks if a view ID is a built-in view. */
export function isBuiltinViewId(viewId: string): viewId is BuiltinViewId {
  return viewId === 'outline' || viewId === 'links' || viewId === 'tags' || viewId === 'properties' || viewId === 'search'
}

/** Extract the plugin view type from a PluginViewId. */
export function getPluginViewType(viewId: PluginViewId): string {
  return viewId.slice(7) // Remove 'plugin:' prefix
}

/** A single split section within the context panel. */
export interface SplitSection {
  id: string
  viewIds: ContextPanelViewId[]
  activeViewId: ContextPanelViewId
  /** Height as a fraction (0–1) of total panel body height. */
  heightFraction: number
}

/** Heading entry for the outline view. */
export interface OutlineHeading {
  text: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  anchor: string
}

/** Link entry for the links view. */
export interface LinkEntry {
  target: string
  displayName: string
  resolved: boolean
}

/** Tag entry for the tags view. */
export interface TagEntry {
  name: string
  count: number
}

/** Context panel state. */
export interface ContextPanelState {
  sections: SplitSection[]
  tabOrder: ContextPanelViewId[]
  outline: {
    headings: OutlineHeading[]
    activeAnchor: string | null
  }
  links: {
    forward: LinkEntry[]
    backlinks: LinkEntry[]
    backlinksLoading: boolean
    backlinksError: string | null
  }
  tags: {
    entries: TagEntry[]
    loading: boolean
    expandedTag: string | null
    tagFiles: string[]
  }
  properties: {
    data: Record<string, unknown> | null
    parseError: string | null
    rawFrontmatter: string | null
  }
}

/** Action types for the context panel reducer. */
export type ContextPanelAction =
  | { type: 'SET_TAB_ORDER'; tabOrder: ContextPanelViewId[] }
  | { type: 'SET_ACTIVE_VIEW'; sectionId: string; viewId: ContextPanelViewId }
  | { type: 'SPLIT_VIEW'; viewId: ContextPanelViewId; targetSectionIndex: number }
  | { type: 'MERGE_SECTION'; sectionId: string; targetSectionId: string; viewId: ContextPanelViewId }
  | { type: 'MOVE_VIEW_TO_SECTION'; viewId: ContextPanelViewId; targetSectionId: string }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'RESIZE_SECTIONS'; heightFractions: number[] }
  | { type: 'SET_OUTLINE'; headings: OutlineHeading[] }
  | { type: 'SET_ACTIVE_ANCHOR'; anchor: string | null }
  | { type: 'SET_FORWARD_LINKS'; links: LinkEntry[] }
  | { type: 'SET_BACKLINKS'; backlinks: LinkEntry[] }
  | { type: 'SET_BACKLINKS_LOADING'; loading: boolean }
  | { type: 'SET_BACKLINKS_ERROR'; error: string | null }
  | { type: 'SET_TAGS'; entries: TagEntry[] }
  | { type: 'SET_TAGS_LOADING'; loading: boolean }
  | { type: 'SET_TAG_EXPANDED'; tag: string | null; files: string[] }
  | { type: 'SET_PROPERTIES'; data: Record<string, unknown> | null; parseError: string | null; rawFrontmatter: string | null }
  | { type: 'RESET_DOCUMENT_STATE' }
  | { type: 'ADD_PLUGIN_VIEW'; viewId: PluginViewId }
  | { type: 'REMOVE_PLUGIN_VIEW'; viewId: PluginViewId }

// ─── Section ID Generation ───────────────────────────────────────────────────

let sectionIdCounter = 0

/** Generates a unique section ID using a simple counter. */
export function generateSectionId(): string {
  sectionIdCounter += 1
  return `section-${sectionIdCounter}`
}

/**
 * Resets the section ID counter. Only for testing purposes.
 * @internal
 */
export function resetSectionIdCounter(): void {
  sectionIdCounter = 0
}

// ─── Default Tab Order ───────────────────────────────────────────────────────

/** Default tab order for the context panel. */
export const DEFAULT_TAB_ORDER: ContextPanelViewId[] = ['outline', 'links', 'tags', 'properties', 'search']

// ─── Initial State ───────────────────────────────────────────────────────────

/** Creates the initial context panel state with a single section containing all views. */
export function createInitialState(): ContextPanelState {
  return {
    sections: [
      {
        id: generateSectionId(),
        viewIds: ['outline', 'links', 'tags', 'properties', 'search'],
        activeViewId: 'outline',
        heightFraction: 1,
      },
    ],
    tabOrder: [...DEFAULT_TAB_ORDER],
    outline: {
      headings: [],
      activeAnchor: null,
    },
    links: {
      forward: [],
      backlinks: [],
      backlinksLoading: false,
      backlinksError: null,
    },
    tags: {
      entries: [],
      loading: false,
      expandedTag: null,
      tagFiles: [],
    },
    properties: {
      data: null,
      parseError: null,
      rawFrontmatter: null,
    },
  }
}

// ─── Reducer ─────────────────────────────────────────────────────────────────

/**
 * Pure reducer handling all context panel state transitions.
 */
export function contextPanelReducer(state: ContextPanelState, action: ContextPanelAction): ContextPanelState {
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
        ? updatedSourceViewIds[0] ?? 'outline'
        : sourceSection.activeViewId

      // Create the new section with the split view
      const newSection: SplitSection = {
        id: generateSectionId(),
        viewIds: [viewId],
        activeViewId: viewId,
        heightFraction: 0, // will be recalculated below
      }

      // Build new sections array with the new section inserted at the target index
      const newSections: SplitSection[] = []
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
      let newSections: SplitSection[]

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
          ? updatedSourceViewIds[0] ?? 'outline'
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
      let newSections: SplitSection[]

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
          ? updatedSourceViewIds[0] ?? 'outline'
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

    case 'SET_OUTLINE': {
      return {
        ...state,
        outline: {
          ...state.outline,
          headings: action.headings,
        },
      }
    }

    case 'SET_ACTIVE_ANCHOR': {
      return {
        ...state,
        outline: {
          ...state.outline,
          activeAnchor: action.anchor,
        },
      }
    }

    case 'SET_FORWARD_LINKS': {
      return {
        ...state,
        links: {
          ...state.links,
          forward: action.links,
        },
      }
    }

    case 'SET_BACKLINKS': {
      return {
        ...state,
        links: {
          ...state.links,
          backlinks: action.backlinks,
          backlinksLoading: false,
          backlinksError: null,
        },
      }
    }

    case 'SET_BACKLINKS_LOADING': {
      return {
        ...state,
        links: {
          ...state.links,
          backlinksLoading: action.loading,
        },
      }
    }

    case 'SET_BACKLINKS_ERROR': {
      return {
        ...state,
        links: {
          ...state.links,
          backlinksError: action.error,
          backlinksLoading: false,
        },
      }
    }

    case 'SET_TAGS': {
      return {
        ...state,
        tags: {
          ...state.tags,
          entries: action.entries,
          loading: false,
        },
      }
    }

    case 'SET_TAGS_LOADING': {
      return {
        ...state,
        tags: {
          ...state.tags,
          loading: action.loading,
        },
      }
    }

    case 'SET_TAG_EXPANDED': {
      return {
        ...state,
        tags: {
          ...state.tags,
          expandedTag: action.tag,
          tagFiles: action.files,
        },
      }
    }

    case 'SET_PROPERTIES': {
      return {
        ...state,
        properties: {
          data: action.data,
          parseError: action.parseError,
          rawFrontmatter: action.rawFrontmatter,
        },
      }
    }

    case 'RESET_DOCUMENT_STATE': {
      return {
        ...state,
        outline: {
          headings: [],
          activeAnchor: null,
        },
        links: {
          forward: [],
          backlinks: [],
          backlinksLoading: false,
          backlinksError: null,
        },
        tags: {
          ...state.tags,
          expandedTag: null,
          tagFiles: [],
        },
        properties: {
          data: null,
          parseError: null,
          rawFrontmatter: null,
        },
      }
    }

    case 'ADD_PLUGIN_VIEW': {
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

    case 'REMOVE_PLUGIN_VIEW': {
      const { viewId } = action

      // Remove from all sections and fix activeViewId if needed
      let newSections = state.sections.map(section => {
        if (!section.viewIds.includes(viewId)) return section
        const updatedViewIds = section.viewIds.filter(v => v !== viewId)
        const activeViewId = section.activeViewId === viewId
          ? (updatedViewIds[0] ?? 'outline')
          : section.activeViewId
        return { ...section, viewIds: updatedViewIds, activeViewId }
      })

      // Remove any sections that became empty (but keep at least one)
      const nonEmptySections = newSections.filter(s => s.viewIds.length > 0)
      if (nonEmptySections.length > 0) {
        const equalFraction = 1 / nonEmptySections.length
        newSections = nonEmptySections.map(s => ({ ...s, heightFraction: equalFraction }))
      } else {
        // All sections empty — restore to default with built-in views only
        newSections = [{
          id: generateSectionId(),
          viewIds: ['outline', 'links', 'tags', 'properties', 'search'],
          activeViewId: 'outline' as ContextPanelViewId,
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
