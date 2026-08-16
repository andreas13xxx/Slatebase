/**
 * SnippetEditorModal — embedded editor for creating/editing a CSS snippet's
 * content (Requirement 8.3, 8.5). A plain textarea is sufficient here: this
 * is a small, self-contained settings dialog, not the main document editor.
 */
import { useState, useEffect, useCallback } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { extractErrorMessage } from '../../utils/error'
import type { IApiClient } from '../../api'
import { snippetStore } from '../../state/snippetStore'

export interface SnippetEditorModalProps {
  apiClient: IApiClient
  vaultId: string
  snippetId: string
  filename: string
  /** Initial content, if already known (skips the load round-trip for newly created snippets). */
  initialContent?: string
  onSaved: (content: string) => void
  onCancel: () => void
}

export function SnippetEditorModal({
  apiClient,
  vaultId,
  snippetId,
  filename,
  initialContent,
  onSaved,
  onCancel,
}: SnippetEditorModalProps) {
  const [content, setContent] = useState(initialContent ?? '')
  const [loading, setLoading] = useState(initialContent === undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useFocusTrap<HTMLDivElement>({ isActive: true, onEscape: onCancel })

  useEffect(() => {
    if (initialContent !== undefined) return
    let cancelled = false
    // No setLoading(true) here: useState already initializes it to exactly this
    // branch's condition, and the modal is mounted fresh per snippet (see
    // SnippetManager), so these deps never change while it is open.
    snippetStore.loadContent(apiClient, vaultId, snippetId)
      .then((loaded) => { if (!cancelled) setContent(loaded) })
      .catch((err: unknown) => { if (!cancelled) setError(extractErrorMessage(err, 'Snippet konnte nicht geladen werden')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [apiClient, vaultId, snippetId, initialContent])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await snippetStore.saveContent(apiClient, vaultId, snippetId, content)
      onSaved(content)
    } catch (err) {
      setError(extractErrorMessage(err, 'Snippet konnte nicht gespeichert werden'))
    } finally {
      setSaving(false)
    }
  }, [apiClient, vaultId, snippetId, content, onSaved])

  return (
    <div className="snippet-editor-overlay" role="presentation" onClick={onCancel}>
      <div
        ref={containerRef}
        className="snippet-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`CSS-Snippet bearbeiten: ${filename}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="snippet-editor-modal__title">{filename}</h2>
        {error && <p className="snippet-editor-modal__error" role="alert">{error}</p>}
        <textarea
          className="snippet-editor-modal__textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={loading || saving}
          spellCheck={false}
          aria-label="CSS-Inhalt"
        />
        <div className="snippet-editor-modal__actions">
          <button type="button" onClick={onCancel} disabled={saving}>Abbrechen</button>
          <button type="button" onClick={handleSave} disabled={loading || saving}>
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
