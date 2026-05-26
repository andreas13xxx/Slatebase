import { useAppContext } from '../state'
import { useTranslation } from '../i18n'

/**
 * FileViewer displays the content of the currently selected file.
 * Shows file name as heading, content in monospace <pre>, and
 * appropriate notices for binary files, truncated files, or errors.
 */
export function FileViewer() {
  const { state } = useAppContext()
  const { t } = useTranslation()

  const { selectedFile, error } = state

  // Show error message with filename and reason when file load fails
  if (error && !selectedFile) {
    return (
      <section className="file-viewer file-viewer--error" aria-label={t('common.error')}>
        <p className="file-viewer-error" role="alert">
          {t('common.errorWithCode', { code: error.code, message: error.message })}
        </p>
      </section>
    )
  }

  // No file selected — render nothing
  if (!selectedFile) {
    return null
  }

  return (
    <section className="file-viewer" aria-label={t('fileViewer.ariaLabel')}>
      <h2 className="file-viewer-heading">{selectedFile.name}</h2>

      {/* Binary file notice */}
      {selectedFile.isBinary && (
        <p className="file-viewer-notice file-viewer-notice--binary" role="status">
          {t('fileViewer.binaryNotice')}
        </p>
      )}

      {/* Truncation notice */}
      {selectedFile.isTruncated && !selectedFile.isBinary && (
        <p className="file-viewer-notice file-viewer-notice--truncated" role="status">
          {t('fileViewer.truncatedNotice')}
        </p>
      )}

      {/* Content in monospace pre, preserving whitespace and UTF-8 */}
      {!selectedFile.isBinary && (
        <pre className="file-viewer-content" style={{ fontFamily: 'monospace' }}>
          {selectedFile.content}
        </pre>
      )}
    </section>
  )
}
