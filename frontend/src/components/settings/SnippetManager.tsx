/**
 * SnippetManager — CSS snippet list, upload, create, edit, toggle, delete
 * (Requirement 8, 9). Embedded in AppearanceSection.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { Trash2, Pencil, Upload, Plus, FileCode } from 'lucide-react'
import { useAppContext } from '../../state'
import { snippetStore, type CssSnippet } from '../../state/snippetStore'
import { snippetInjector } from '../../plugins/appearance/snippet-injector'
import { extractErrorMessage } from '../../utils/error'
import { ConfirmModal } from '../ConfirmModal'
import { InlineInput } from '../InlineInput'
import { SnippetEditorModal } from './SnippetEditorModal'
import './SnippetManager.css'

const MAX_SNIPPET_SIZE = 512 * 1024
const FILENAME_BODY_PATTERN = /^[a-zA-Z0-9_-]+$/

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

/** Normalizes a user-entered snippet name into a valid `<name>.css` filename. */
function toFilename(rawName: string): string {
  const trimmed = rawName.trim()
  return trimmed.toLowerCase().endsWith('.css') ? trimmed : `${trimmed}.css`
}

function validateSnippetName(rawName: string): string | null {
  const filename = toFilename(rawName)
  const body = filename.slice(0, -'.css'.length)
  if (!FILENAME_BODY_PATTERN.test(body)) {
    return 'Nur Buchstaben, Zahlen, "_" und "-" erlaubt'
  }
  return null
}

export function SnippetManager() {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  const [snippets, setSnippets] = useState<CssSnippet[]>([])
  // Starts true when the mount effect below will actually fetch, so that first
  // load needs no synchronous setState from inside the effect.
  const [loading, setLoading] = useState(() => Boolean(vaultId && apiClient))
  const [error, setError] = useState<string | null>(null)
  const [creatingName, setCreatingName] = useState(false)
  const [editing, setEditing] = useState<CssSnippet | null>(null)
  const [deleting, setDeleting] = useState<CssSnippet | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!vaultId || !apiClient) return
    setLoading(true)
    setError(null)
    try {
      setSnippets(await snippetStore.listForVault(apiClient, vaultId))
    } catch (err) {
      setError(extractErrorMessage(err, 'Snippets konnten nicht geladen werden'))
    } finally {
      setLoading(false)
    }
  }, [vaultId, apiClient])

  // Deliberately not `void load()`: that sets state synchronously inside the
  // effect (cascading render) and has no cancellation, so an unmount mid-fetch
  // still lands a setState. The handlers below keep using load() — a synchronous
  // setState is fine in an event handler.
  useEffect(() => {
    if (!vaultId || !apiClient) return
    let cancelled = false
    snippetStore.listForVault(apiClient, vaultId)
      .then((items) => { if (!cancelled) setSnippets(items) })
      .catch((err: unknown) => { if (!cancelled) setError(extractErrorMessage(err, 'Snippets konnten nicht geladen werden')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vaultId, apiClient])

  const handleToggleEnabled = useCallback(async (snippet: CssSnippet) => {
    if (!vaultId || !apiClient) return
    const nextEnabled = !snippet.enabled
    setSnippets((prev) => prev.map((s) => (s.id === snippet.id ? { ...s, enabled: nextEnabled } : s)))

    try {
      if (nextEnabled) {
        const content = await snippetStore.loadContent(apiClient, vaultId, snippet.id)
        snippetInjector.apply(snippet.id, content)
      } else {
        snippetInjector.remove(snippet.id)
      }
      await snippetStore.setEnabled(apiClient, vaultId, snippet.id, nextEnabled)
    } catch (err) {
      // Roll back on failure
      setSnippets((prev) => prev.map((s) => (s.id === snippet.id ? { ...s, enabled: snippet.enabled } : s)))
      if (!nextEnabled) snippetInjector.remove(snippet.id)
      setError(extractErrorMessage(err, 'Snippet konnte nicht aktiviert werden'))
    }
  }, [vaultId, apiClient])

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !vaultId || !apiClient) return

    if (file.size > MAX_SNIPPET_SIZE) {
      setError(`Datei überschreitet die maximale Größe von 512 KB (${formatSize(file.size)})`)
      return
    }

    const filename = file.name.toLowerCase().endsWith('.css') ? file.name : `${file.name}.css`
    try {
      const content = await file.text()
      await snippetStore.create(apiClient, vaultId, filename, content)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err, 'Snippet konnte nicht hochgeladen werden'))
    }
  }, [vaultId, apiClient, load])

  const handleCreateConfirm = useCallback(async (rawName: string) => {
    setCreatingName(false)
    if (!vaultId || !apiClient) return
    const filename = toFilename(rawName)
    try {
      const created = await snippetStore.create(apiClient, vaultId, filename, '')
      await load()
      setEditing(created)
    } catch (err) {
      setError(extractErrorMessage(err, 'Snippet konnte nicht erstellt werden'))
    }
  }, [vaultId, apiClient, load])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleting || !vaultId || !apiClient) return
    const target = deleting
    setDeleting(null)
    try {
      await snippetStore.remove(apiClient, vaultId, target.id)
      snippetInjector.remove(target.id)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err, 'Snippet konnte nicht gelöscht werden'))
    }
  }, [deleting, vaultId, apiClient, load])

  const handleEditorSaved = useCallback(async (content: string) => {
    if (editing) {
      if (editing.enabled) {
        snippetInjector.apply(editing.id, content)
      }
      await load()
    }
    setEditing(null)
  }, [editing, load])

  if (!vaultId) return null

  return (
    <div className="snippet-manager">
      <p className="appearance-section__description">CSS-Snippets für diesen Vault:</p>

      {error && <p className="snippet-manager__error" role="alert">{error}</p>}

      {loading && <p className="snippet-manager__loading">Lädt…</p>}

      {!loading && snippets.length === 0 && (
        <p className="snippet-manager__empty">Keine CSS-Snippets in diesem Vault.</p>
      )}

      {!loading && snippets.length > 0 && (
        <ul className="snippet-manager__list" role="list">
          {snippets.map((snippet) => (
            <li key={snippet.id} className="snippet-manager__item">
              <label className="snippet-manager__toggle">
                <input
                  type="checkbox"
                  checked={snippet.enabled}
                  onChange={() => void handleToggleEnabled(snippet)}
                  aria-label={`${snippet.filename} aktivieren`}
                />
              </label>
              <FileCode size={14} className="snippet-manager__icon" aria-hidden="true" />
              <span className="snippet-manager__filename">{snippet.filename}</span>
              <span className="snippet-manager__size">{formatSize(snippet.size)}</span>
              <button
                type="button"
                className="snippet-manager__action-btn"
                onClick={() => setEditing(snippet)}
                aria-label={`${snippet.filename} bearbeiten`}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                className="snippet-manager__action-btn"
                onClick={() => setDeleting(snippet)}
                aria-label={`${snippet.filename} löschen`}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="snippet-manager__toolbar">
        <button type="button" onClick={handleUploadClick}>
          <Upload size={14} aria-hidden="true" /> Hochladen
        </button>
        <button type="button" onClick={() => setCreatingName(true)}>
          <Plus size={14} aria-hidden="true" /> Neu erstellen
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".css"
          className="snippet-manager__file-input"
          onChange={(e) => void handleFileSelected(e)}
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {creatingName && (
        <InlineInput
          initialValue="neues-snippet.css"
          onConfirm={(value) => void handleCreateConfirm(value)}
          onCancel={() => setCreatingName(false)}
          validate={validateSnippetName}
        />
      )}

      {editing && apiClient && (
        <SnippetEditorModal
          apiClient={apiClient}
          vaultId={vaultId}
          snippetId={editing.id}
          filename={editing.filename}
          initialContent={editing.size === 0 ? '' : undefined}
          onSaved={(content) => void handleEditorSaved(content)}
          onCancel={() => setEditing(null)}
        />
      )}

      <ConfirmModal
        open={deleting !== null}
        title="Snippet löschen"
        message={deleting ? `"${deleting.filename}" wirklich löschen? Dies kann nicht rückgängig gemacht werden.` : ''}
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
