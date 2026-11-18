/**
 * KeychainSection — Settings section for the vault keychain: named secrets
 * (API keys, tokens) shared by every plugin of the vault, stored server-side
 * and encrypted at rest, never in the vault. Values stay masked until the user
 * asks to see one. Collaborators with read access see the entry names only.
 *
 * @module components/settings/KeychainSection
 */
import { useTranslation, translateNow } from '../../i18n'
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
  const { t } = useTranslation()
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
      setError(extractErrorMessage(err, translateNow('settingsUi.misc_kcLoadFailed')))
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
      .catch((err: unknown) => { if (!cancelled) setError(extractErrorMessage(err, translateNow('settingsUi.misc_kcLoadFailed'))) })
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
      showToast('error', extractErrorMessage(err, translateNow('settingsUi.misc_kcChangeFailed')))
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
        showToast('error', translateNow('settingsUi.misc_kcGone'))
        await load()
        return
      }
      setRevealed((current) => ({ ...current, [id]: value }))
    } catch (err: unknown) {
      showToast('error', extractErrorMessage(err, translateNow('settingsUi.misc_kcReadFailed')))
    }
  }, [vaultId, apiClient, revealed, load])

  const handleAdd = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    if (!vaultId || !apiClient) return
    const id = newId.trim()
    if (ids.includes(id)) return
    const ok = await mutate(() => apiClient.setKeychainSecret(vaultId, id, newValue), translateNow('settingsUi.misc_kcSaved', { id: id }))
    if (ok) {
      setNewId('')
      setNewValue('')
    }
  }, [vaultId, apiClient, newId, newValue, ids, mutate])

  const handleSaveEdit = useCallback(async (event: FormEvent) => {
    event.preventDefault()
    if (!vaultId || !apiClient || editing === null) return
    const id = editing
    const ok = await mutate(() => apiClient.setKeychainSecret(vaultId, id, editValue), translateNow('settingsUi.misc_kcUpdated', { id: id }))
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
    await mutate(() => apiClient.deleteKeychainSecret(vaultId, id), translateNow('settingsUi.misc_kcDeleted', { id: id }))
  }, [vaultId, apiClient, deleting, mutate])

  if (!vaultId || !apiClient) {
    return <p className="settings-content-no-vault">{t('settingsUi.misc_noVault')}</p>
  }

  if (loading) {
    return <p className="settings-loading">{t('settingsUi.misc_kcLoading')}</p>
  }

  const newIdTrimmed = newId.trim()
  const newIdTaken = ids.includes(newIdTrimmed)
  const newIdInvalid = newIdTrimmed !== '' && (!SECRET_ID_PATTERN.test(newIdTrimmed) || newIdTrimmed.length > SECRET_ID_MAX_LENGTH)

  return (
    <div className="keychain-section">
      {error && <p className="settings-error" role="alert">{error}</p>}

      <SettingSection
        title={t('settingsUi.misc_keychain')}
        description={t('settingsUi.misc_keychainDesc')}
      >
        {!canWrite && (
          <p className="settings-field-hint">{t('settingsUi.misc_keychainReadOnly')}</p>
        )}

        {ids.length === 0 ? (
          <p className="keychain-section__empty">{t('settingsUi.misc_noEntries')}</p>
        ) : (
          <ul className="keychain-section__list" aria-label={t('settingsUi.misc_entriesLabel')}>
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
                      placeholder={t('settingsUi.misc_newValue')}
                      autoComplete="off"
                      disabled={busy}
                      ref={editInputRef}
                    />
                    <Button type="submit" variant="primary" size="sm" disabled={busy || editValue === ''}>{t('settingsUi.misc_save')}</Button>
                    <Button size="sm" onClick={() => { setEditing(null); setEditValue('') }} disabled={busy}>{t('settingsUi.misc_cancel')}</Button>
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
                          aria-label={id in revealed ? t('settingsUi.misc_kcHide', { id: id }) : t('settingsUi.misc_kcShow', { id: id })}
                          aria-pressed={id in revealed}
                        >
                          {id in revealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditing(id); setEditValue('') }}
                          aria-label={t('settingsUi.misc_kcChange', { id: id })}
                          disabled={busy}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(id)}
                          aria-label={t('settingsUi.misc_kcDeleteNamed', { id: id })}
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
        <SettingSection title={t('settingsUi.misc_addEntry')}>
          <form onSubmit={handleAdd}>
            <div className="settings-field">
              <label htmlFor="keychain-new-id" className="settings-field-label">{t('settingsUi.misc_name')}</label>
              <p className="settings-field-hint" id="keychain-new-id-hint">
                {t('settingsUi.misc_kcNameHint1')} <code>mein-api-schluessel</code>.
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
              {newIdInvalid && <p className="settings-error" role="alert">{t('settingsUi.misc_invalidName')}</p>}
              {newIdTaken && <p className="settings-error" role="alert">{t('settingsUi.misc_nameTaken')}</p>}
            </div>
            <div className="settings-field">
              <label htmlFor="keychain-new-value" className="settings-field-label">{t('settingsUi.misc_value')}</label>
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
                {t('settingsUi.misc_add')}
              </Button>
            </div>
          </form>
        </SettingSection>
      )}

      <ConfirmModal
        open={deleting !== null}
        title={t('settingsUi.misc_deleteEntryTitle')}
        message={t('settingsUi.misc_kcDeleteMessage', { id: deleting ?? '' })}
        confirmLabel={t('settingsUi.misc_delete')}
        variant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
