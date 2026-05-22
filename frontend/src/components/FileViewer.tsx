import { useAppContext } from '../state'

/**
 * FileViewer displays the content of the currently selected file.
 * Shows file name as heading, content in monospace <pre>, and
 * appropriate notices for binary files, truncated files, or errors.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */
export function FileViewer() {
  const { state } = useAppContext()

  const { selectedFile, error } = state

  // Show error message with filename and reason when file load fails (Req 4.4)
  if (error && !selectedFile) {
    return (
      <section className="file-viewer file-viewer--error" aria-label="Dateifehler">
        <p className="file-viewer-error" role="alert">
          Fehler beim Laden der Datei: [{error.code}] {error.message}
        </p>
      </section>
    )
  }

  // No file selected — render nothing
  if (!selectedFile) {
    return null
  }

  return (
    <section className="file-viewer" aria-label="Dateiansicht">
      {/* Req 4.2: File name as heading */}
      <h2 className="file-viewer-heading">{selectedFile.name}</h2>

      {/* Req 4.6: Binary file notice */}
      {selectedFile.isBinary && (
        <p className="file-viewer-notice file-viewer-notice--binary" role="status">
          Diese Datei ist eine Binärdatei und kann nicht als Klartext dargestellt werden
        </p>
      )}

      {/* Req 4.7: Truncation notice */}
      {selectedFile.isTruncated && !selectedFile.isBinary && (
        <p className="file-viewer-notice file-viewer-notice--truncated" role="status">
          Datei wurde abgeschnitten (nur die ersten 5 MB werden angezeigt)
        </p>
      )}

      {/* Req 4.1, 4.3, 4.5: Content in monospace pre, preserving whitespace and UTF-8 */}
      {!selectedFile.isBinary && (
        <pre className="file-viewer-content" style={{ fontFamily: 'monospace' }}>
          {selectedFile.content}
        </pre>
      )}
    </section>
  )
}
