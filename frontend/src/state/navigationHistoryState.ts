/**
 * Navigation history state — a browser-like back/forward stack of visited files.
 *
 * Session-only (no localStorage persistence): resets on page reload, same as a
 * browser tab's history resets when the tab process restarts. See design.md
 * "Navigationsverlauf" for the rationale.
 */

/** A single navigable location: a file within a vault, optionally scrolled to an anchor. */
export interface NavHistoryEntry {
  vaultId: string
  filePath: string
  fileName: string
  /** Heading/block anchor, when navigation was triggered from a specific location. */
  anchor?: string
}

/**
 * Where a RECORD_VISIT originated.
 * - 'visit': a regular navigation (link click, explorer, search, switcher, tab click/cycle, …) —
 *   detected centrally whenever the active tab changes, regardless of what triggered it.
 * - 'history-nav': the result of GO_BACK/GO_FORWARD itself re-activating a tab — must not
 *   be re-recorded as a new visit (Requirement 1.1's exception clause).
 */
export type NavHistoryOrigin = 'visit' | 'history-nav'

export interface NavigationHistoryState {
  back: NavHistoryEntry[]
  forward: NavHistoryEntry[]
  /** The entry currently being viewed — pushed onto `forward` when going back. */
  current: NavHistoryEntry | null
}

export type NavigationHistoryAction =
  | { type: 'RECORD_VISIT'; entry: NavHistoryEntry; origin: NavHistoryOrigin }
  | { type: 'GO_BACK' }
  | { type: 'GO_FORWARD' }
  | { type: 'DROP_ENTRY'; vaultId: string; filePath: string }
  | { type: 'CLEAR' }

/** Maximum entries retained per direction (Requirement 1.9). */
export const MAX_STACK_SIZE = 50

export const initialNavigationHistoryState: NavigationHistoryState = {
  back: [],
  forward: [],
  current: null,
}

function sameEntry(a: NavHistoryEntry, b: NavHistoryEntry): boolean {
  return a.vaultId === b.vaultId && a.filePath === b.filePath
}

export function navigationHistoryReducer(
  state: NavigationHistoryState,
  action: NavigationHistoryAction,
): NavigationHistoryState {
  switch (action.type) {
    case 'RECORD_VISIT': {
      const { entry, origin } = action

      // A history-nav visit is the result of GO_BACK/GO_FORWARD already having
      // moved `current` — it must not itself push another entry (Requirement 1.1
      // exception clause, Property 3).
      if (origin === 'history-nav') {
        return { ...state, current: entry }
      }

      // Re-visiting the same file the user is already on is a no-op (avoids
      // duplicate back-stack entries e.g. from clicking the already-active tab).
      if (state.current && sameEntry(state.current, entry)) {
        return state
      }

      const nextBack = state.current ? [...state.back, state.current] : [...state.back]
      const trimmedBack = nextBack.length > MAX_STACK_SIZE
        ? nextBack.slice(nextBack.length - MAX_STACK_SIZE)
        : nextBack

      return {
        back: trimmedBack,
        forward: [], // Requirement 1.6: new navigation discards the forward stack
        current: entry,
      }
    }

    case 'GO_BACK': {
      if (state.back.length === 0) return state
      const previous = state.back[state.back.length - 1]!
      const newBack = state.back.slice(0, -1)
      const newForward = state.current
        ? [state.current, ...state.forward].slice(0, MAX_STACK_SIZE)
        : state.forward
      return { back: newBack, forward: newForward, current: previous }
    }

    case 'GO_FORWARD': {
      if (state.forward.length === 0) return state
      const next = state.forward[0]!
      const newForward = state.forward.slice(1)
      const newBack = state.current
        ? [...state.back, state.current].slice(-MAX_STACK_SIZE)
        : state.back
      return { back: newBack, forward: newForward, current: next }
    }

    case 'DROP_ENTRY': {
      const { vaultId, filePath } = action
      const matches = (e: NavHistoryEntry) => e.vaultId === vaultId && e.filePath === filePath
      return {
        back: state.back.filter((e) => !matches(e)),
        forward: state.forward.filter((e) => !matches(e)),
        current: state.current && matches(state.current) ? null : state.current,
      }
    }

    case 'CLEAR':
      return initialNavigationHistoryState

    default:
      return state
  }
}
