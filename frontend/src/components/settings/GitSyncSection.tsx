/**
 * GitSyncSection — Settings section for per-vault git-sync configuration.
 * Lets the vault owner configure the shared local branch and manage one or
 * more git remotes (native `git`-based sync, run server-side).
 *
 * @module components/settings/GitSyncSection
 */
import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { RefreshCw, Pencil, Trash2, Plus, KeyRound, Copy } from 'lucide-react'
import { useAppContext } from '../../state'
import type { GitSyncRemoteInfo, GitSyncRemoteStatusInfo, GitAuthMethod } from '../../api'
import { extractErrorMessage } from '../../utils/error'
import { ConfirmModal } from '../ConfirmModal'
import { SettingSection, Button } from './ui'
import { formatLastRun, resultLabel, resultBadgeClass } from './syncStatusFormat'
import './SyncSection.css'

interface RemoteFormState {
  name: string
  remoteUrl: string
  authMethod: GitAuthMethod
  credential: string
  intervalMinutes: string
  enabled: boolean
}

const EMPTY_FORM: RemoteFormState = {
  name: '',
  remoteUrl: '',
  authMethod: 'https-token',
  credential: '',
  intervalMinutes: '15',
  enabled: true,
}

// Mirrors the backend check in `backend/src/git-sync/validation.ts`: a key
// with only its base64 body pasted (no framing) fails server-side with an
// opaque "error in libcrypto: unsupported" — catch it here for immediate feedback.
function looksLikeFramedPrivateKey(value: string): boolean {
  return /-----BEGIN [A-Z0-9 ]+PRIVATE KEY-----/.test(value) && /-----END [A-Z0-9 ]+PRIVATE KEY-----/.test(value)
}

export function GitSyncSection() {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  const [branch, setBranch] = useState('main')
  const [branchInput, setBranchInput] = useState('main')
  const [remotes, setRemotes] = useState<GitSyncRemoteInfo[]>([])
  const [statuses, setStatuses] = useState<Record<string, GitSyncRemoteStatusInfo>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingBranch, setSavingBranch] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<GitSyncRemoteInfo | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RemoteFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [generatingKey, setGeneratingKey] = useState(false)
  // The public key belonging to whatever is currently in `form.credential` — either
  // the remote's already-stored key (shown while the field is left empty during
  // edit) or a freshly generated one. Cleared whenever the credential is hand-edited,
  // since it would otherwise show a public key that doesn't match what gets saved.
  const [displayedPublicKey, setDisplayedPublicKey] = useState<string | null>(null)
  const [publicKeyCopied, setPublicKeyCopied] = useState(false)

  // Pure fetch (no state writes) so it can be called both from the mount
  // effect (via a cancellable .then/.catch/.finally chain, since setting
  // state directly and synchronously inside an effect body triggers
  // cascading renders) and from event handlers that want a fresh reload.
  const fetchData = useCallback(async () => {
    if (!vaultId || !apiClient) throw new Error('No vault selected')
    const data = await apiClient.getGitSyncData(vaultId)
    const statusEntries = await Promise.all(
      data.remotes.map((remote) => apiClient.getGitSyncStatus(vaultId, remote.id)),
    )
    return { data, statuses: Object.fromEntries(statusEntries.map((s) => [s.remoteId, s])) }
  }, [vaultId, apiClient])

  const applyLoaded = useCallback((result: Awaited<ReturnType<typeof fetchData>>) => {
    setBranch(result.data.branch)
    setBranchInput(result.data.branch)
    setRemotes(result.data.remotes)
    setStatuses(result.statuses)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      applyLoaded(await fetchData())
    } catch (err) {
      setError(extractErrorMessage(err, 'Git-Sync-Konfiguration konnte nicht geladen werden'))
    } finally {
      setLoading(false)
    }
  }, [fetchData, applyLoaded])

  useEffect(() => {
    if (!vaultId || !apiClient) return
    let cancelled = false
    fetchData()
      .then((result) => { if (!cancelled) { applyLoaded(result); setError(null) } })
      .catch((err: unknown) => { if (!cancelled) setError(extractErrorMessage(err, 'Git-Sync-Konfiguration konnte nicht geladen werden')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vaultId, apiClient, fetchData, applyLoaded])

  const handleSaveBranch = useCallback(async () => {
    if (!vaultId || !apiClient) return
    setSavingBranch(true)
    setError(null)
    try {
      const result = await apiClient.setGitSyncBranch(vaultId, branchInput.trim())
      setBranch(result.branch)
      setBranchInput(result.branch)
    } catch (err) {
      setError(extractErrorMessage(err, 'Branch konnte nicht gespeichert werden'))
    } finally {
      setSavingBranch(false)
    }
  }, [vaultId, apiClient, branchInput])

  const handleToggleEnabled = useCallback(async (remote: GitSyncRemoteInfo) => {
    if (!vaultId || !apiClient) return
    const nextEnabled = !remote.enabled
    setRemotes((prev) => prev.map((r) => (r.id === remote.id ? { ...r, enabled: nextEnabled } : r)))
    try {
      await apiClient.updateGitSyncRemote(vaultId, remote.id, { enabled: nextEnabled })
    } catch (err) {
      setRemotes((prev) => prev.map((r) => (r.id === remote.id ? { ...r, enabled: remote.enabled } : r)))
      setError(extractErrorMessage(err, 'Remote konnte nicht aktualisiert werden'))
    }
  }, [vaultId, apiClient])

  const handleSyncNow = useCallback(async (remote: GitSyncRemoteInfo) => {
    if (!vaultId || !apiClient) return
    setSyncingId(remote.id)
    setError(null)
    try {
      const outcome = await apiClient.triggerGitSyncNow(vaultId, remote.id)
      const status = await apiClient.getGitSyncStatus(vaultId, remote.id)
      setStatuses((prev) => ({ ...prev, [remote.id]: status }))
      if (outcome.result === 'error') {
        setError(outcome.error ?? 'Synchronisation fehlgeschlagen')
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Synchronisation fehlgeschlagen'))
    } finally {
      setSyncingId(null)
    }
  }, [vaultId, apiClient])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleting || !vaultId || !apiClient) return
    const target = deleting
    setDeleting(null)
    try {
      await apiClient.deleteGitSyncRemote(vaultId, target.id)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err, 'Remote konnte nicht entfernt werden'))
    }
  }, [deleting, vaultId, apiClient, load])

  const openCreateForm = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setDisplayedPublicKey(null)
    setFormOpen(true)
  }, [])

  const openEditForm = useCallback((remote: GitSyncRemoteInfo) => {
    setEditingId(remote.id)
    setForm({
      name: remote.name,
      remoteUrl: remote.remoteUrl,
      authMethod: remote.authMethod,
      credential: '',
      intervalMinutes: String(remote.intervalMinutes),
      enabled: remote.enabled,
    })
    setFormError(null)
    setDisplayedPublicKey(remote.authMethod === 'ssh-key' ? (remote.publicKey ?? null) : null)
    setFormOpen(true)
  }, [])

  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditingId(null)
  }, [])

  const handleCredentialChange = useCallback((value: string) => {
    setForm((f) => ({ ...f, credential: value }))
    setDisplayedPublicKey(null) // the shown key no longer matches the hand-edited credential
  }, [])

  const handleGenerateKey = useCallback(async () => {
    if (!vaultId || !apiClient) return
    setGeneratingKey(true)
    setFormError(null)
    try {
      const { privateKey, publicKey } = await apiClient.generateGitSyncSshKey(vaultId)
      setForm((f) => ({ ...f, credential: privateKey }))
      setDisplayedPublicKey(publicKey)
    } catch (err) {
      setFormError(extractErrorMessage(err, 'Schlüsselpaar konnte nicht generiert werden'))
    } finally {
      setGeneratingKey(false)
    }
  }, [vaultId, apiClient])

  const handleCopyPublicKey = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setPublicKeyCopied(true)
      setTimeout(() => setPublicKeyCopied(false), 2000)
    } catch {
      // clipboard access denied — the value is still selectable/visible in the box
    }
  }, [])

  const handleFormSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!vaultId || !apiClient) return

    const intervalMinutes = Number.parseInt(form.intervalMinutes, 10)
    if (!form.name.trim() || !form.remoteUrl.trim()) {
      setFormError('Name und Remote-URL sind erforderlich')
      return
    }
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
      setFormError('Das Intervall muss mindestens 1 Minute betragen')
      return
    }
    if (editingId === null && form.credential.trim() === '') {
      setFormError(form.authMethod === 'https-token' ? 'Personal Access Token ist erforderlich' : 'Privater SSH-Schlüssel ist erforderlich')
      return
    }
    if (form.authMethod === 'ssh-key' && form.credential.trim() !== '' && !looksLikeFramedPrivateKey(form.credential)) {
      setFormError('Der private SSH-Schlüssel muss die vollständigen Zeilen "-----BEGIN ... PRIVATE KEY-----" und "-----END ... PRIVATE KEY-----" enthalten')
      return
    }

    setFormSaving(true)
    setFormError(null)
    try {
      if (editingId === null) {
        await apiClient.createGitSyncRemote(vaultId, {
          name: form.name.trim(),
          remoteUrl: form.remoteUrl.trim(),
          authMethod: form.authMethod,
          credential: form.credential,
          intervalMinutes,
          enabled: form.enabled,
        })
      } else {
        await apiClient.updateGitSyncRemote(vaultId, editingId, {
          name: form.name.trim(),
          remoteUrl: form.remoteUrl.trim(),
          authMethod: form.authMethod,
          ...(form.credential.trim() !== '' && { credential: form.credential }),
          intervalMinutes,
          enabled: form.enabled,
        })
      }
      setFormOpen(false)
      setEditingId(null)
      await load()
    } catch (err) {
      setFormError(extractErrorMessage(err, 'Remote konnte nicht gespeichert werden'))
    } finally {
      setFormSaving(false)
    }
  }, [vaultId, apiClient, form, editingId, load])

  if (!vaultId) return null

  return (
    <div className="git-sync-section">
      {error && <p className="settings-error" role="alert">{error}</p>}

      <SettingSection
        title="Branch"
        description="Alle Remotes dieses Vaults teilen sich denselben lokalen Branch, da ein Arbeitsverzeichnis nur auf einem Branch stehen kann."
      >
        <div className="settings-field">
          <label htmlFor="git-sync-branch" className="settings-field-label">Branch</label>
          <input
            id="git-sync-branch"
            type="text"
            className="settings-field-input"
            value={branchInput}
            onChange={(e) => setBranchInput(e.target.value)}
            disabled={loading || savingBranch}
          />
        </div>
        <div className="settings-actions">
          <Button variant="primary" onClick={() => void handleSaveBranch()} disabled={savingBranch || branchInput.trim() === branch || branchInput.trim() === ''}>
            {savingBranch ? 'Speichern…' : 'Speichern'}
          </Button>
        </div>
      </SettingSection>

      <SettingSection title="Remotes" description="Git-Remotes, mit denen dieser Vault synchronisiert wird.">
        {loading && <p className="settings-loading">Lädt…</p>}

        {!loading && remotes.length === 0 && (
          <p className="sync-section__empty">Noch keine Remotes konfiguriert.</p>
        )}

        {!loading && remotes.length > 0 && (
          <ul className="sync-section__list" role="list">
            {remotes.map((remote) => {
              const status = statuses[remote.id]
              return (
                <li key={remote.id} className="sync-section__item">
                  <div className="sync-section__item-header">
                    <label className="sync-section__toggle">
                      <input
                        type="checkbox"
                        checked={remote.enabled}
                        onChange={() => void handleToggleEnabled(remote)}
                        aria-label={`${remote.name} aktivieren`}
                      />
                    </label>
                    <span className="sync-section__item-name">{remote.name}</span>
                  </div>

                  <span className="sync-section__item-detail">{remote.remoteUrl}</span>

                  <div className="sync-section__item-meta">
                    <span>{remote.authMethod === 'https-token' ? 'HTTPS-Token' : 'SSH-Schlüssel'}</span>
                    <span>alle {remote.intervalMinutes} Min.</span>
                  </div>

                  {remote.authMethod === 'ssh-key' && remote.publicKey && (() => {
                    const publicKey = remote.publicKey
                    return (
                      <div className="sync-section__item-publickey">
                        <code>{publicKey}</code>
                        <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopyPublicKey(publicKey)}>
                          <Copy size={12} aria-hidden="true" /> Kopieren
                        </Button>
                      </div>
                    )
                  })()}

                  <div className="sync-section__item-status">
                    <span className={`sync-status-badge ${resultBadgeClass(status?.lastResult ?? null)}`}>
                      {resultLabel(status?.lastResult ?? null)}
                    </span>
                    <span>{formatLastRun(status?.lastRunAt ?? null)}</span>
                    {status?.lastResult === 'success' && (status.lastPulledFiles !== null || status.lastPushedFiles !== null) && (
                      <span>{status.lastPulledFiles ?? 0} Datei(en) geholt, {status.lastPushedFiles ?? 0} Datei(en) gepusht</span>
                    )}
                  </div>

                  {status?.lastResult === 'conflict' && status.conflictFiles.length > 0 && (
                    <p className="sync-section__item-error">
                      Konflikt in: {status.conflictFiles.join(', ')} — bitte im Editor direkt lösen. Die automatische Synchronisation ist für diesen Remote pausiert, bis ihr danach erneut auf "Jetzt synchronisieren" klickt.
                    </p>
                  )}
                  {status?.lastResult === 'error' && status.lastError && (
                    <p className="sync-section__item-error">{status.lastError}</p>
                  )}

                  <div className="sync-section__item-actions">
                    <Button size="sm" onClick={() => void handleSyncNow(remote)} disabled={syncingId === remote.id}>
                      <RefreshCw size={14} aria-hidden="true" /> {syncingId === remote.id ? 'Synchronisiert…' : 'Jetzt synchronisieren'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEditForm(remote)}>
                      <Pencil size={14} aria-hidden="true" /> Bearbeiten
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(remote)}>
                      <Trash2 size={14} aria-hidden="true" /> Entfernen
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {!formOpen && (
          <div className="settings-actions">
            <Button variant="secondary" onClick={openCreateForm}>
              <Plus size={14} aria-hidden="true" /> Remote hinzufügen
            </Button>
          </div>
        )}

        {formOpen && (
          <form className="sync-section__form" onSubmit={(e) => void handleFormSubmit(e)}>
            {formError && <p className="settings-error" role="alert">{formError}</p>}

            <div className="settings-field">
              <label htmlFor="git-sync-form-name" className="settings-field-label">Name</label>
              <input
                id="git-sync-form-name"
                type="text"
                className="settings-field-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="z.B. GitHub"
                disabled={formSaving}
              />
            </div>

            <div className="settings-field">
              <label htmlFor="git-sync-form-url" className="settings-field-label">Remote-URL</label>
              <input
                id="git-sync-form-url"
                type="text"
                className="settings-field-input"
                value={form.remoteUrl}
                onChange={(e) => setForm((f) => ({ ...f, remoteUrl: e.target.value }))}
                placeholder="https://github.com/user/repo.git"
                disabled={formSaving}
              />
            </div>

            <div className="sync-section__form-row">
              <div className="settings-field">
                <label htmlFor="git-sync-form-auth" className="settings-field-label">Auth-Methode</label>
                <select
                  id="git-sync-form-auth"
                  className="settings-field-input"
                  value={form.authMethod}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, authMethod: e.target.value as GitAuthMethod, credential: '' }))
                    setDisplayedPublicKey(null)
                  }}
                  disabled={formSaving}
                >
                  <option value="https-token">HTTPS-Token</option>
                  <option value="ssh-key">SSH-Schlüssel</option>
                </select>
              </div>
              <div className="settings-field">
                <label htmlFor="git-sync-form-interval" className="settings-field-label">Intervall (Minuten)</label>
                <input
                  id="git-sync-form-interval"
                  type="number"
                  min={1}
                  max={1440}
                  className="settings-field-input"
                  value={form.intervalMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, intervalMinutes: e.target.value }))}
                  disabled={formSaving}
                />
              </div>
            </div>

            <div className="settings-field">
              <label htmlFor="git-sync-form-credential" className="settings-field-label">
                {form.authMethod === 'https-token' ? 'Personal Access Token' : 'Privater SSH-Schlüssel'}
              </label>
              <p className="settings-field-hint">
                {editingId !== null
                  ? 'Leer lassen, um das gespeicherte Credential unverändert zu lassen.'
                  : form.authMethod === 'https-token'
                    ? 'Wird verschlüsselt gespeichert und nie im Klartext zurückgegeben.'
                    : 'Vollständiger Inhalt der privaten Schlüsseldatei, inklusive der Zeilen "-----BEGIN ... PRIVATE KEY-----" und "-----END ... PRIVATE KEY-----". Wird verschlüsselt gespeichert und nie im Klartext zurückgegeben.'}
              </p>
              {form.authMethod === 'https-token' ? (
                <input
                  id="git-sync-form-credential"
                  type="password"
                  className="settings-field-input"
                  value={form.credential}
                  onChange={(e) => setForm((f) => ({ ...f, credential: e.target.value }))}
                  disabled={formSaving}
                  autoComplete="off"
                />
              ) : (
                <>
                  <textarea
                    id="git-sync-form-credential"
                    className="settings-field-input"
                    rows={6}
                    value={form.credential}
                    onChange={(e) => handleCredentialChange(e.target.value)}
                    disabled={formSaving || generatingKey}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  />
                  <div className="settings-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleGenerateKey()}
                      disabled={formSaving || generatingKey}
                    >
                      <KeyRound size={14} aria-hidden="true" /> {generatingKey ? 'Generiert…' : 'Schlüsselpaar generieren'}
                    </Button>
                  </div>
                  {displayedPublicKey && (
                    <div className="ssh-public-key-box">
                      <code className="ssh-public-key-box__value">{displayedPublicKey}</code>
                      <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopyPublicKey(displayedPublicKey)}>
                        <Copy size={14} aria-hidden="true" /> {publicKeyCopied ? 'Kopiert' : 'Kopieren'}
                      </Button>
                    </div>
                  )}
                  <p className="settings-field-hint">
                    Öffentlichen Schlüssel als Deploy Key (mit Schreibzugriff) im GitHub-Repository unter Settings → Deploy keys eintragen.
                  </p>
                </>
              )}
            </div>

            <label className="settings-field-checkbox-label">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                disabled={formSaving}
              />
              Aktiviert
            </label>

            <div className="settings-actions">
              <Button type="submit" variant="primary" disabled={formSaving}>
                {formSaving ? 'Speichern…' : 'Speichern'}
              </Button>
              <Button type="button" variant="ghost" onClick={closeForm} disabled={formSaving}>
                Abbrechen
              </Button>
            </div>
          </form>
        )}
      </SettingSection>

      <ConfirmModal
        open={deleting !== null}
        title="Remote entfernen"
        message={deleting ? `"${deleting.name}" wirklich entfernen? Das gespeicherte Credential wird ebenfalls gelöscht.` : ''}
        confirmLabel="Entfernen"
        variant="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
