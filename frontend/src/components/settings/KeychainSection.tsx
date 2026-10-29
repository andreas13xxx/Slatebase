/**
 * KeychainSection — Settings section for the vault keychain: named secrets
 * (API keys, tokens) shared by every plugin of the vault, stored server-side
 * and encrypted at rest, never in the vault. Values stay masked until the user
 * asks to see one. Collaborators with read access see the entry names only.
 *
 * @module components/settings/KeychainSection
 */
import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { Eye, EyeOff, Pencil, Trash2 } from 'lucide-react'
import { useAppContext } from '../../state'
import { extractErrorMessage } from '../../utils/error'
import { reloadVaultSecretStorage } from '../../plugins/compat/obsidian-api-extensions'
import { showToast } from '../ToastNotification'
import { ConfirmModal } from '../ConfirmModal'
import { PasswordInput } from '../PasswordInput'
import { SettingSection, Button } from './ui'
import './KeychainSection.css'

/** Obsidian's secret ID format (same rule as the server). */
const SECRET_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SECRET_ID_MAX_LENGTH = 128

export function KeychainSection() {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId
  const canWrite = state.vaults.find((vault) => vault.id === vaultId)?.permission !== 'read'

  const [ids, setIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Values the user asked to see. */
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newId, setNewId] = useState('')
  const [newValue, setNewValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!vaultId || !apiClient) return
    try {
      setIds(await apiClient.listKeychainSecrets(vaultId))
      setError(null)
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Schlüsselbund konnte nicht geladen werden'))
    } finally {
      setLoading(false)
    }
  }, [vaultId, apiClient])

  useEffect(() => {
    if (!vaultId || !apiClient) return
    let cancelled = false
    apiClient.listKeychainSecrets(vaultId)
      .then((list) => {
        if (cancelled) return
        setIds(list)
        setError(null)
        setRevealed({})
        setEditing(null)
      })
      .catch((err: unknown) => { if (!cancelled) setError(extractErrorMessage(err, 'Schlüsselbund konnte nicht geladen werden')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vaultId, apiClient])

  // Move focus into the field when a row switches to editing.
  useEffect(() => {
    if (editing !== null) editInputRef.current?.focus()
  }, [editing])

  /** Runs a change, then refreshes the list and tells running plugins about it. */
  const mutate = useCallback(async (action: () => Promise<void>, successMessage: string): Promise<boolean> => {
    if (!vaultId) return false
    setBusy(true)
    try {
      await action()
      await load()
      await reloadVaultSecretStorage(vaultId)
      showToast('success', successMessage)
      return true
    } catch (err: unknown) {
      showToast('error', extractErrorMessage(err, 'Änderung am Schlüsselbund fehlgeschlagen'))
      return false
    } finally {
      setBusy(false)
    }
  }, [vaultId, load])

  const toggleReveal = useCallback(async (id: string) => {
    if (!vaultId || !apiClient) return
    if (id in revealed) {
      setRevealed(({ [id]: _hidden, ...rest }) => rest)
      return
    }
    try {
      const value = await apiClient.getKeychainSecret(vaultId, id)
      if (value === null) {
        showToast('error', 'Der Eintrag existiert nicht mehr')
        await load()
        return
      }
      setRevealed((current) => ({ ...current, [id]: value }))
    } catch (err: unknown) {
      showToast('error', extractErrorMessage(err, 'Wert konnte nicht gelesen werden'))
    }
  }, [vaultId, apiClient, revealed, load])

  const handleAdd = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    if (!vaultId || !apiClient) return
    const id = newId.trim()
    if (ids.includes(id)) return
    const ok = await mutate(() => apiClient.setKeychainSecret(vaultId, id, newValue), `„${id}“ gespeichert`)
    if (ok) {
      setNewId('')
      setNewValue('')
    }
  }, [vaultId, apiClient, newId, newValue, ids, mutate])

  const handleSaveEdit = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    if (!vaultId || !apiClient || editing === null) return
    const id = editing
    const ok = await mutate(() => apiClient.setKeychainSecret(vaultId, id, editValue), `„${id}“ aktualisiert`)
    if (ok) {
      setEditing(null)
      setEditValue('')
      setRevealed(({ [id]: _stale, ...rest }) => rest)
    }
  }, [vaultId, apiClient, editing, editValue, mutate])

  const handleDelete = useCallback(async () => {
    if (!vaultId || !apiClient || deleting === null) return
    const id = deleting
    setDeleting(null)
    await mutate(() => apiClient.deleteKeychainSecret(vaultId, id), `„${id}“ gelöscht`)
  }, [vaultId, apiClient, deleting, mutate])

  if (!vaultId || !apiClient) {
    return <p className="settings-content-no-vault">Kein Vault aktiv. Bitte wähle einen Vault im Datei-Explorer aus.</p>
  }

  if (loading) {
    return <p className="settings-loading">Lade Schlüsselbund…</p>
  }

  const newIdTrimmed = newId.trim()
  const newIdTaken = ids.includes(newIdTrimmed)
  const newIdInvalid = newIdTrimmed !== '' && (!SECRET_ID_PATTERN.test(newIdTrimmed) || newIdTrimmed.length > SECRET_ID_MAX_LENGTH)

  return (
    <div className="keychain-section">
      {error && <p className="settings-error" role="alert">{error}</p>}

      <SettingSection
        title="Schlüsselbund"
        description="Benannte Geheimnisse (API-Schlüssel, Tokens) dieses Vaults. Alle aktiven Plugins des Vaults können sie lesen. Sie liegen verschlüsselt auf dem Server, nicht im Vault, und werden nicht mit Git oder anderen Geräten synchronisiert."
      >
        {!canWrite && (
          <p className="settings-field-hint">Mit Lesezugriff siehst du nur die Namen. Werte lesen und ändern darf, wer den Vault bearbeiten darf.</p>
        )}

        {ids.length === 0 ? (
          <p className="keychain-section__empty">Noch keine Einträge.</p>
        ) : (
          <ul className="keychain-section__list" aria-label="Einträge im Schlüsselbund">
            {ids.map((id) => (
              <li key={id} className="keychain-section__item">
                {editing === id ? (
                  <form className="keychain-section__edit" onSubmit={handleSaveEdit}>
                    <label htmlFor={`keychain-edit-${id}`} className="keychain-section__id">{id}</label>
                    <PasswordInput
                      id={`keychain-edit-${id}`}
                      className="settings-field-input"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="Neuer Wert"
                      autoComplete="off"
                      disabled={busy}
                      ref={editInputRef}
                    />
                    <Button type="submit" variant="primary" size="sm" disabled={busy || editValue === ''}>Speichern</Button>
                    <Button size="sm" onClick={() => { setEditing(null); setEditValue('') }} disabled={busy}>Abbrechen</Button>
                  </form>
                ) : (
                  <>
                    <span className="keychain-section__id">{id}</span>
                    {canWrite && (
                      <>
                        <code className="keychain-section__value" aria-live="polite">
                          {id in revealed ? revealed[id] : '••••••••'}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void toggleReveal(id)}
                          aria-label={id in revealed ? `Wert von ${id} verbergen` : `Wert von ${id} anzeigen`}
                          aria-pressed={id in revealed}
                        >
                          {id in revealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditing(id); setEditValue('') }}
                          aria-label={`Wert von ${id} ändern`}
                          disabled={busy}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(id)}
                          aria-label={`${id} löschen`}
                          disabled={busy}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingSection>

      {canWrite && (
        <SettingSection title="Eintrag hinzufügen">
          <form onSubmit={handleAdd}>
            <div className="settings-field">
              <label htmlFor="keychain-new-id" className="settings-field-label">Name</label>
              <p className="settings-field-hint" id="keychain-new-id-hint">
                Kleinbuchstaben, Ziffern und einzelne Bindestriche, zum Beispiel <code>mein-api-schluessel</code>.
              </p>
              <input
                id="keychain-new-id"
                type="text"
                className="settings-field-input"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                aria-describedby="keychain-new-id-hint"
                aria-invalid={newIdInvalid || newIdTaken}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
              {newIdInvalid && <p className="settings-error" role="alert">Ungültiger Name.</p>}
              {newIdTaken && <p className="settings-error" role="alert">Dieser Name existiert schon. Ändere den Eintrag in der Liste.</p>}
            </div>
            <div className="settings-field">
              <label htmlFor="keychain-new-value" className="settings-field-label">Wert</label>
              <PasswordInput
                id="keychain-new-value"
                className="settings-field-input"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <div className="settings-actions">
              <Button type="submit" variant="primary" disabled={busy || newIdTrimmed === '' || newIdInvalid || newIdTaken || newValue === ''}>
                Hinzufügen
              </Button>
            </div>
          </form>
        </SettingSection>
      )}

      <ConfirmModal
        open={deleting !== null}
        title="Eintrag löschen?"
        message={`„${deleting ?? ''}“ wird aus dem Schlüsselbund entfernt. Plugins, die ihn nutzen, verlieren den Zugriff. Das lässt sich nicht rückgängig machen.`}
        confirmLabel="Löschen"
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
