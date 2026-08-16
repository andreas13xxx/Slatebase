import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigationHistory } from '../state/navigationHistoryContext'

/**
 * Back/forward buttons for the navigation history (Requirements 1.2–1.5).
 * Rendered next to the TabBar; disabled when the respective stack is empty.
 */
export function NavigationControls() {
  const { goBack, goForward, canGoBack, canGoForward } = useNavigationHistory()

  return (
    <div className="nav-controls" role="group" aria-label="Navigation">
      <button
        type="button"
        className="nav-controls-button"
        onClick={goBack}
        disabled={!canGoBack}
        aria-label="Zurück"
        title="Zurück"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        className="nav-controls-button"
        onClick={goForward}
        disabled={!canGoForward}
        aria-label="Vor"
        title="Vor"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
