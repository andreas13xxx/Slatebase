import { FilePlus, LayoutDashboard, Database, Search, X } from 'lucide-react'
import { useTranslation } from '../i18n'
import type { RecentFileEntry } from '../state/recentFilesStore'
import './EmptyTabView.css'

/** Props for the EmptyTabView component. */
export interface EmptyTabViewProps {
  /** Runs a core command by its Obsidian ID (`file-explorer:new-file`, `switcher:open`, ...). */
  onRunCommand: (commandId: string) => void
  /** Recently opened files of the active vault, newest first. */
  recentFiles: RecentFileEntry[]
  /** Opens one of the recent files. */
  onOpenFile: (path: string) => void
  /** Closes the empty tab. */
  onClose: () => void
}

/**
 * Content of an empty tab (Obsidian's `empty` view): what to do next, as buttons —
 * create a note, canvas or base, jump to a file, reopen a recent one, or close the tab.
 */
export function EmptyTabView({ onRunCommand, recentFiles, onOpenFile, onClose }: EmptyTabViewProps) {
  const { t } = useTranslation()
  return (
    <div className="tab-content tab-content--empty-view" role="tabpanel" aria-label={t('viewTabs.empty.panelLabel')}>
      <div className="empty-tab">
        <ul className="empty-tab__actions">
          <li>
            <button type="button" className="empty-tab__action" onClick={() => onRunCommand('file-explorer:new-file')}>
              <FilePlus size={16} aria-hidden="true" />
              {t('viewTabs.empty.newNote')}
            </button>
          </li>
          <li>
            <button type="button" className="empty-tab__action" onClick={() => onRunCommand('canvas:new-file')}>
              <LayoutDashboard size={16} aria-hidden="true" />
              {t('viewTabs.empty.newCanvas')}
            </button>
          </li>
          <li>
            <button type="button" className="empty-tab__action" onClick={() => onRunCommand('bases:new-file')}>
              <Database size={16} aria-hidden="true" />
              {t('viewTabs.empty.newBase')}
            </button>
          </li>
          <li>
            <button type="button" className="empty-tab__action" onClick={() => onRunCommand('switcher:open')}>
              <Search size={16} aria-hidden="true" />
              {t('viewTabs.empty.goToFile')}
            </button>
          </li>
          <li>
            <button type="button" className="empty-tab__action" onClick={onClose}>
              <X size={16} aria-hidden="true" />
              {t('viewTabs.empty.close')}
            </button>
          </li>
        </ul>
        {recentFiles.length > 0 && (
          <section className="empty-tab__recent" aria-label={t('viewTabs.empty.recent')}>
            <h2 className="empty-tab__recent-title">{t('viewTabs.empty.recent')}</h2>
            <ul className="empty-tab__recent-list">
              {recentFiles.map((entry) => (
                <li key={`${entry.vaultId}::${entry.path}`}>
                  <button type="button" className="empty-tab__recent-item" onClick={() => onOpenFile(entry.path)}>
                    {entry.path}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
