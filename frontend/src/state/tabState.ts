/**
 * Tab state management for the tabbed editor/viewer system.
 * Manages open tabs, active tab, mode switching, and edit buffers.
 */

/** Display mode for a tab: edit (plain text editor) or view (rendered Markdown). */
export type TabMode = 'edit' | 'view'

/** A single open tab entry with its associated state. */
export interface TabEntry {
  /** Unique tab ID derived from vaultId + filePath. */
  id: string
  vaultId: string
  /** Relative path from vault root. */
  filePath: string
  /** Filename portion of the path (last segment). */
  fileName: string
  mode: TabMode
  isBinary: boolean
  /** Last loaded/saved content (server truth). */
  content: string
  /** Unsaved edits (null = no changes). */
  editBuffer: string | null
  loading: boolean
  error: string | null
}

/** Global tab state. */
export interface TabState {
  tabs: TabEntry[]
  activeTabId: string | null
}

/** Discriminated union of all tab actions. */
export type TabAction =
  | { type: 'OPEN_TAB'; payload: { vaultId: string; filePath: string; fileName: string } }
  | { type: 'CLOSE_TAB'; payload: { tabId: string } }
  | { type: 'ACTIVATE_TAB'; payload: { tabId: string } }
  | { type: 'TOGGLE_MODE'; payload: { tabId: string } }
  | { type: 'TAB_CONTENT_LOADED'; payload: { tabId: string; content: string; isBinary: boolean } }
  | { type: 'TAB_LOADING'; payload: { tabId: string } }
  | { type: 'TAB_ERROR'; payload: { tabId: string; error: string } }
  | { type: 'UPDATE_EDIT_BUFFER'; payload: { tabId: string; content: string } }
  | { type: 'SAVE_SUCCESS'; payload: { tabId: string; content: string } }
  | { type: 'SAVE_ERROR'; payload: { tabId: string; error: string } }
  | { type: 'CLEAR_ALL_TABS' }

/** Initial tab state with no open tabs. */
export const initialTabState: TabState = {
  tabs: [],
  activeTabId: null,
}

/**
 * Generates a deterministic tab ID from vault ID and file path.
 * Ensures the same file always maps to the same tab ID for duplicate detection.
 */
export function generateTabId(vaultId: string, filePath: string): string {
  return `${vaultId}::${filePath}`
}

/**
 * Pure reducer handling all tab state transitions.
 */
export function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case 'OPEN_TAB': {
      const { vaultId, filePath, fileName } = action.payload
      const tabId = generateTabId(vaultId, filePath)

      // If tab already exists, just activate it
      const existingTab = state.tabs.find((t) => t.id === tabId)
      if (existingTab) {
        return {
          ...state,
          activeTabId: tabId,
        }
      }

      // Create new tab entry
      const newTab: TabEntry = {
        id: tabId,
        vaultId,
        filePath,
        fileName,
        mode: 'view', // default, will be confirmed on TAB_CONTENT_LOADED
        isBinary: false,
        content: '',
        editBuffer: null,
        loading: true,
        error: null,
      }

      return {
        ...state,
        tabs: [...state.tabs, newTab],
        activeTabId: tabId,
      }
    }

    case 'CLOSE_TAB': {
      const { tabId } = action.payload
      const closedIndex = state.tabs.findIndex((t) => t.id === tabId)
      if (closedIndex === -1) return state

      const newTabs = state.tabs.filter((t) => t.id !== tabId)

      // Determine new active tab
      let newActiveTabId: string | null = state.activeTabId

      if (state.activeTabId === tabId) {
        if (newTabs.length === 0) {
          newActiveTabId = null
        } else if (closedIndex < newTabs.length) {
          // Right neighbor (same index in the filtered array)
          newActiveTabId = newTabs[closedIndex].id
        } else {
          // Left neighbor (last item in filtered array)
          newActiveTabId = newTabs[closedIndex - 1].id
        }
      }

      return {
        ...state,
        tabs: newTabs,
        activeTabId: newActiveTabId,
      }
    }

    case 'ACTIVATE_TAB': {
      const { tabId } = action.payload
      const exists = state.tabs.some((t) => t.id === tabId)
      if (!exists) return state

      return {
        ...state,
        activeTabId: tabId,
      }
    }

    case 'TOGGLE_MODE': {
      const { tabId } = action.payload
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== tabId) return tab
          // Binary files cannot toggle mode
          if (tab.isBinary) return tab
          return {
            ...tab,
            mode: tab.mode === 'edit' ? 'view' : 'edit',
          }
        }),
      }
    }

    case 'TAB_CONTENT_LOADED': {
      const { tabId, content, isBinary } = action.payload
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== tabId) return tab
          return {
            ...tab,
            content,
            isBinary,
            // Initial mode: always view (user can switch to edit manually)
            mode: 'view',
            loading: false,
            error: null,
          }
        }),
      }
    }

    case 'TAB_LOADING': {
      const { tabId } = action.payload
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== tabId) return tab
          return {
            ...tab,
            loading: true,
            error: null,
          }
        }),
      }
    }

    case 'TAB_ERROR': {
      const { tabId, error } = action.payload
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== tabId) return tab
          return {
            ...tab,
            loading: false,
            error,
          }
        }),
      }
    }

    case 'UPDATE_EDIT_BUFFER': {
      const { tabId, content } = action.payload
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== tabId) return tab
          return {
            ...tab,
            editBuffer: content,
          }
        }),
      }
    }

    case 'SAVE_SUCCESS': {
      const { tabId, content } = action.payload
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== tabId) return tab
          return {
            ...tab,
            content,
            editBuffer: null,
            error: null,
          }
        }),
      }
    }

    case 'SAVE_ERROR': {
      const { tabId, error } = action.payload
      return {
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== tabId) return tab
          return {
            ...tab,
            error,
          }
        }),
      }
    }

    case 'CLEAR_ALL_TABS': {
      return initialTabState
    }
  }
}
