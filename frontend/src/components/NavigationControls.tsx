import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '../i18n'
import { useNavigationHistory } from '../state/navigationHistoryContext'

/**
 * Back/forward buttons for the navigation history (Requirements 1.2–1.5).
 * Rendered in the EditorHeaderRow below the tab bar; disabled when the respective stack is empty.
 */
export function NavigationControls() {
  const { t } = useTranslation()
  const { goBack, goForward, canGoBack, canGoForward } = useNavigationHistory()

  return (
    <div className="nav-controls" role="group" aria-label={t('commonUi.c_navigation')}>
      <button
        type="button"
        className="nav-controls-button"
        onClick={goBack}
        disabled={!canGoBack}
        aria-label={t('commonUi.c_back')}
        title={t('commonUi.c_back')}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        className="nav-controls-button"
        onClick={goForward}
        disabled={!canGoForward}
        aria-label={t('commonUi.c_forward')}
        title={t('commonUi.c_forward')}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
