import { Loader2 } from 'lucide-react'
import { InfoModal } from './InfoModal'
import { useReleaseNotes } from '../hooks/useReleaseNotes'
import { markdownToHtml } from '../utils/simpleMarkdownToHtml'
import { useTranslation } from '../i18n'

export interface ReleaseNotesModalProps {
  open: boolean
  onClose: () => void
}

/** `app:show-release-notes` — shows the most recent GitHub release notes. */
export function ReleaseNotesModal({ open, onClose }: ReleaseNotesModalProps) {
  const { t } = useTranslation()
  const { releases, loading, error } = useReleaseNotes(open)

  return (
    <InfoModal open={open} title={t('releaseNotes.title')} closeLabel={t('common.close')} onClose={onClose}>
      {loading && (
        <div className="info-modal__loading">
          <Loader2 size={16} className="spin" aria-hidden="true" />
          <span>{t('releaseNotes.loading')}</span>
        </div>
      )}
      {!loading && error && (
        <div className="info-modal__error">{t('releaseNotes.error')}</div>
      )}
      {!loading && !error && releases.length === 0 && (
        <div className="info-modal__error">{t('releaseNotes.empty')}</div>
      )}
      {!loading && !error && releases.map((release) => (
        <div key={release.tagName} className="info-modal__release">
          <h3 className="info-modal__release-title">
            <a href={release.htmlUrl} target="_blank" rel="noopener noreferrer">
              {release.name ?? release.tagName}
            </a>
          </h3>
          {release.body && (
            <div
              className="info-modal__markdown"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(release.body) }}
            />
          )}
        </div>
      ))}
    </InfoModal>
  )
}
