/**
 * MailImportSection — Settings section for per-vault IMAP mail-import
 * configuration. Lets the vault owner manage one or more mailboxes that get
 * polled server-side and imported as Markdown notes with attachments.
 *
 * @module components/settings/MailImportSection
 */
import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { RefreshCw, Pencil, Trash2, Plus, FolderTree, Folder } from 'lucide-react'
import { useAppContext } from '../../state'
import type { MailImportConfigInfo, MailImportRunStatusInfo, MailboxTreeNode } from '../../api'
import { extractErrorMessage } from '../../utils/error'
import { ConfirmModal } from '../ConfirmModal'
import { SettingSection, Button } from './ui'
import { formatLastRun, resultLabel, resultBadgeClass } from './syncStatusFormat'
import './SyncSection.css'

/** Recursively renders an IMAP mailbox tree; clicking a selectable folder reports its exact path. */
function MailboxTreeList({ nodes, onSelect, depth = 0 }: { nodes: MailboxTreeNode[]; onSelect: (path: string) => void; depth?: number }) {
  if (nodes.length === 0) return null
  return (
    <ul className="mailbox-tree__list" role="list" style={{ paddingLeft: depth === 0 ? 0 : 16 }}>
      {nodes.map((node) => (
        <li key={node.path} className="mailbox-tree__item">
          {node.selectable ? (
            <button type="button" className="mailbox-tree__node-btn" onClick={() => onSelect(node.path)} title={node.path}>
              <Folder size={13} aria-hidden="true" /> {node.name}
            </button>
          ) : (
            <span className="mailbox-tree__node-label">
              <Folder size={13} aria-hidden="true" /> {node.name}
            </span>
          )}
          <MailboxTreeList nodes={node.children} onSelect={onSelect} depth={depth + 1} />
        </li>
      ))}
    </ul>
  )
}

interface ConfigFormState {
  name: string
  host: string
  port: string
  secure: boolean
  username: string
  password: string
  mailbox: string
  targetFolder: string
  intervalMinutes: string
  enabled: boolean
}

const EMPTY_FORM: ConfigFormState = {
  name: '',
  host: '',
  port: '993',
  secure: true,
  username: '',
  password: '',
  mailbox: 'INBOX',
  targetFolder: '',
  intervalMinutes: '15',
  enabled: true,
}

export function MailImportSection() {
  const { state, apiClient } = useAppContext()
  const vaultId = state.selectedVaultId

  const [configs, setConfigs] = useState<MailImportConfigInfo[]>([])
  const [statuses, setStatuses] = useState<Record<string, MailImportRunStatusInfo>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<MailImportConfigInfo | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ConfigFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [mailboxTreeOpen, setMailboxTreeOpen] = useState(false)
  const [mailboxTree, setMailboxTree] = useState<MailboxTreeNode[] | null>(null)
  const [mailboxTreeLoading, setMailboxTreeLoading] = useState(false)
  const [mailboxTreeError, setMailboxTreeError] = useState<string | null>(null)

  // Pure fetch (no state writes) so it can be called both from the mount
  // effect (via a cancellable .then/.catch/.finally chain, since setting
  // state directly and synchronously inside an effect body triggers
  // cascading renders) and from event handlers that want a fresh reload.
  const fetchData = useCallback(async () => {
    if (!vaultId || !apiClient) throw new Error('No vault selected')
    const { configs: loaded } = await apiClient.listMailImportConfigs(vaultId)
    const statusEntries = await Promise.all(
      loaded.map((config) => apiClient.getMailImportStatus(vaultId, config.id)),
    )
    return { configs: loaded, statuses: Object.fromEntries(statusEntries.map((s) => [s.configId, s])) }
  }, [vaultId, apiClient])

  const applyLoaded = useCallback((result: Awaited<ReturnType<typeof fetchData>>) => {
    setConfigs(result.configs)
    setStatuses(result.statuses)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      applyLoaded(await fetchData())
    } catch (err) {
      setError(extractErrorMessage(err, 'Mail-Import-Konfiguration konnte nicht geladen werden'))
    } finally {
      setLoading(false)
    }
  }, [fetchData, applyLoaded])

  useEffect(() => {
    if (!vaultId || !apiClient) return
    let cancelled = false
    fetchData()
      .then((result) => { if (!cancelled) { applyLoaded(result); setError(null) } })
      .catch((err: unknown) => { if (!cancelled) setError(extractErrorMessage(err, 'Mail-Import-Konfiguration konnte nicht geladen werden')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [vaultId, apiClient, fetchData, applyLoaded])

  const handleToggleEnabled = useCallback(async (config: MailImportConfigInfo) => {
    if (!vaultId || !apiClient) return
    const nextEnabled = !config.enabled
    setConfigs((prev) => prev.map((c) => (c.id === config.id ? { ...c, enabled: nextEnabled } : c)))
    try {
      await apiClient.updateMailImportConfig(vaultId, config.id, { enabled: nextEnabled })
    } catch (err) {
      setConfigs((prev) => prev.map((c) => (c.id === config.id ? { ...c, enabled: config.enabled } : c)))
      setError(extractErrorMessage(err, 'Konto konnte nicht aktualisiert werden'))
    }
  }, [vaultId, apiClient])

  const handleImportNow = useCallback(async (config: MailImportConfigInfo) => {
    if (!vaultId || !apiClient) return
    setImportingId(config.id)
    setError(null)
    try {
      const outcome = await apiClient.triggerMailImportNow(vaultId, config.id)
      const status = await apiClient.getMailImportStatus(vaultId, config.id)
      setStatuses((prev) => ({ ...prev, [config.id]: status }))
      if (outcome.result === 'error') {
        setError(outcome.error ?? 'Import fehlgeschlagen')
      }
    } catch (err) {
      setError(extractErrorMessage(err, 'Import fehlgeschlagen'))
    } finally {
      setImportingId(null)
    }
  }, [vaultId, apiClient])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleting || !vaultId || !apiClient) return
    const target = deleting
    setDeleting(null)
    try {
      await apiClient.deleteMailImportConfig(vaultId, target.id)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err, 'Konto konnte nicht entfernt werden'))
    }
  }, [deleting, vaultId, apiClient, load])

  const openCreateForm = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setMailboxTreeOpen(false)
    setMailboxTree(null)
    setFormOpen(true)
  }, [])

  const openEditForm = useCallback((config: MailImportConfigInfo) => {
    setEditingId(config.id)
    setForm({
      name: config.name,
      host: config.host,
      port: String(config.port),
      secure: config.secure,
      username: config.username,
      password: '',
      mailbox: config.mailbox,
      targetFolder: config.targetFolder,
      intervalMinutes: String(config.intervalMinutes),
      enabled: config.enabled,
    })
    setFormError(null)
    setMailboxTreeOpen(false)
    setMailboxTree(null)
    setFormOpen(true)
  }, [])

  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditingId(null)
    setMailboxTreeOpen(false)
  }, [])

  // Only available while editing an already-saved config: browsing the
  // folder tree needs a stored password, which a not-yet-created config
  // doesn't have yet.
  const handleBrowseMailboxes = useCallback(async () => {
    if (!vaultId || !apiClient || editingId === null) return
    setMailboxTreeOpen((open) => !open)
    if (mailboxTree !== null) return // already loaded — just toggle visibility
    setMailboxTreeLoading(true)
    setMailboxTreeError(null)
    try {
      const { tree } = await apiClient.getMailImportMailboxTree(vaultId, editingId)
      setMailboxTree(tree)
    } catch (err) {
      setMailboxTreeError(extractErrorMessage(err, 'Ordner konnten nicht geladen werden'))
    } finally {
      setMailboxTreeLoading(false)
    }
  }, [vaultId, apiClient, editingId, mailboxTree])

  const handleSelectMailbox = useCallback((path: string) => {
    setForm((f) => ({ ...f, mailbox: path }))
    setMailboxTreeOpen(false)
  }, [])

  const handleFormSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!vaultId || !apiClient) return

    const port = Number.parseInt(form.port, 10)
    const intervalMinutes = Number.parseInt(form.intervalMinutes, 10)
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      setFormError('Name, Host und Benutzername sind erforderlich')
      return
    }
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      setFormError('Der Port muss zwischen 1 und 65535 liegen')
      return
    }
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) {
      setFormError('Das Intervall muss mindestens 1 Minute betragen')
      return
    }
    if (editingId === null && form.password.trim() === '') {
      setFormError('Passwort ist erforderlich')
      return
    }

    setFormSaving(true)
    setFormError(null)
    try {
      if (editingId === null) {
        await apiClient.createMailImportConfig(vaultId, {
          name: form.name.trim(),
          host: form.host.trim(),
          port,
          secure: form.secure,
          username: form.username.trim(),
          password: form.password,
          mailbox: form.mailbox.trim() || 'INBOX',
          targetFolder: form.targetFolder.trim(),
          intervalMinutes,
          enabled: form.enabled,
        })
      } else {
        await apiClient.updateMailImportConfig(vaultId, editingId, {
          name: form.name.trim(),
          host: form.host.trim(),
          port,
          secure: form.secure,
          username: form.username.trim(),
          ...(form.password.trim() !== '' && { password: form.password }),
          mailbox: form.mailbox.trim() || 'INBOX',
          targetFolder: form.targetFolder.trim(),
          intervalMinutes,
          enabled: form.enabled,
        })
      }
      setFormOpen(false)
      setEditingId(null)
      await load()
    } catch (err) {
      setFormError(extractErrorMessage(err, 'Konto konnte nicht gespeichert werden'))
    } finally {
      setFormSaving(false)
    }
  }, [vaultId, apiClient, form, editingId, load])

  if (!vaultId) return null

  return (
    <div className="mail-import-section">
      {error && <p className="settings-error" role="alert">{error}</p>}

      <SettingSection title="Postfächer" description="IMAP-Postfächer, die periodisch nach neuen E-Mails abgefragt und als Markdown-Notizen mit Anhängen in diesen Vault importiert werden.">
        {loading && <p className="settings-loading">Lädt…</p>}

        {!loading && configs.length === 0 && (
          <p className="sync-section__empty">Noch keine Postfächer konfiguriert.</p>
        )}

        {!loading && configs.length > 0 && (
          <ul className="sync-section__list" role="list">
            {configs.map((config) => {
              const status = statuses[config.id]
              return (
                <li key={config.id} className="sync-section__item">
                  <div className="sync-section__item-header">
                    <label className="sync-section__toggle">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={() => void handleToggleEnabled(config)}
                        aria-label={`${config.name} aktivieren`}
                      />
                    </label>
                    <span className="sync-section__item-name">{config.name}</span>
                  </div>

                  <span className="sync-section__item-detail">
                    {config.username}@{config.host}:{config.port} ({config.mailbox})
                  </span>

                  <div className="sync-section__item-meta">
                    <span>{config.secure ? 'TLS' : 'Ohne TLS'}</span>
                    <span>Ziel: {config.targetFolder || '(Vault-Wurzel)'}</span>
                    <span>alle {config.intervalMinutes} Min.</span>
                  </div>

                  <div className="sync-section__item-status">
                    <span className={`sync-status-badge ${resultBadgeClass(status?.lastResult ?? null)}`}>
                      {resultLabel(status?.lastResult ?? null)}
                    </span>
                    <span>{formatLastRun(status?.lastRunAt ?? null)}</span>
                    {status && status.lastRunAt && (
                      status.lastFoundCount === 0
                        ? <span>Keine neuen Mails</span>
                        : <span>{status.lastImportedCount} von {status.lastFoundCount} Mail(s) importiert</span>
                    )}
                  </div>

                  {status?.lastResult === 'error' && status.lastError && (
                    <p className="sync-section__item-error">{status.lastError}</p>
                  )}

                  <div className="sync-section__item-actions">
                    <Button size="sm" onClick={() => void handleImportNow(config)} disabled={importingId === config.id}>
                      <RefreshCw size={14} aria-hidden="true" /> {importingId === config.id ? 'Importiert…' : 'Jetzt importieren'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEditForm(config)}>
                      <Pencil size={14} aria-hidden="true" /> Bearbeiten
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(config)}>
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
              <Plus size={14} aria-hidden="true" /> Postfach hinzufügen
            </Button>
          </div>
        )}

        {formOpen && (
          <form className="sync-section__form" onSubmit={(e) => void handleFormSubmit(e)}>
            {formError && <p className="settings-error" role="alert">{formError}</p>}

            <div className="settings-field">
              <label htmlFor="mail-import-form-name" className="settings-field-label">Name</label>
              <input
                id="mail-import-form-name"
                type="text"
                className="settings-field-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="z.B. Privates Postfach"
                disabled={formSaving}
              />
            </div>

            <div className="sync-section__form-row">
              <div className="settings-field">
                <label htmlFor="mail-import-form-host" className="settings-field-label">Host</label>
                <input
                  id="mail-import-form-host"
                  type="text"
                  className="settings-field-input"
                  value={form.host}
                  onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                  placeholder="imap.example.com"
                  disabled={formSaving}
                />
              </div>
              <div className="settings-field">
                <label htmlFor="mail-import-form-port" className="settings-field-label">Port</label>
                <input
                  id="mail-import-form-port"
                  type="number"
                  min={1}
                  max={65535}
                  className="settings-field-input"
                  value={form.port}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                  disabled={formSaving}
                />
              </div>
            </div>

            <label className="settings-field-checkbox-label">
              <input
                type="checkbox"
                checked={form.secure}
                onChange={(e) => setForm((f) => ({ ...f, secure: e.target.checked }))}
                disabled={formSaving}
              />
              TLS verwenden
            </label>

            <div className="sync-section__form-row">
              <div className="settings-field">
                <label htmlFor="mail-import-form-username" className="settings-field-label">Benutzername</label>
                <input
                  id="mail-import-form-username"
                  type="text"
                  className="settings-field-input"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  autoComplete="off"
                  disabled={formSaving}
                />
              </div>
              <div className="settings-field">
                <label htmlFor="mail-import-form-password" className="settings-field-label">Passwort</label>
                <input
                  id="mail-import-form-password"
                  type="password"
                  className="settings-field-input"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="off"
                  disabled={formSaving}
                />
              </div>
            </div>
            <p className="settings-field-hint">
              {editingId !== null
                ? 'Passwort leer lassen, um das gespeicherte Passwort unverändert zu lassen.'
                : 'Wird verschlüsselt gespeichert und nie im Klartext zurückgegeben.'}
            </p>

            <div className="sync-section__form-row">
              <div className="settings-field">
                <label htmlFor="mail-import-form-mailbox" className="settings-field-label">IMAP-Ordner</label>
                <div className="mailbox-field-row">
                  <input
                    id="mail-import-form-mailbox"
                    type="text"
                    className="settings-field-input"
                    value={form.mailbox}
                    onChange={(e) => setForm((f) => ({ ...f, mailbox: e.target.value }))}
                    placeholder="INBOX"
                    disabled={formSaving}
                  />
                  {editingId !== null && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void handleBrowseMailboxes()} disabled={formSaving}>
                      <FolderTree size={14} aria-hidden="true" /> Durchsuchen
                    </Button>
                  )}
                </div>
                {editingId === null && (
                  <p className="settings-field-hint">Nach dem ersten Speichern kannst du die verfügbaren Ordner direkt durchsuchen.</p>
                )}
              </div>
              <div className="settings-field">
                <label htmlFor="mail-import-form-interval" className="settings-field-label">Intervall (Minuten)</label>
                <input
                  id="mail-import-form-interval"
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

            {mailboxTreeOpen && (
              <div className="mailbox-tree">
                {mailboxTreeLoading && <p className="settings-loading">Ordner werden geladen…</p>}
                {mailboxTreeError && <p className="settings-error" role="alert">{mailboxTreeError}</p>}
                {!mailboxTreeLoading && !mailboxTreeError && mailboxTree && (
                  mailboxTree.length === 0
                    ? <p className="sync-section__empty">Keine Ordner gefunden.</p>
                    : <MailboxTreeList nodes={mailboxTree} onSelect={handleSelectMailbox} />
                )}
              </div>
            )}

            <div className="settings-field">
              <label htmlFor="mail-import-form-target" className="settings-field-label">Zielordner im Vault</label>
              <p className="settings-field-hint">Relativer Pfad im Vault. Leer = Vault-Wurzel. Anhänge landen in einem <code>attachments</code>-Unterordner davon.</p>
              <input
                id="mail-import-form-target"
                type="text"
                className="settings-field-input"
                value={form.targetFolder}
                onChange={(e) => setForm((f) => ({ ...f, targetFolder: e.target.value }))}
                placeholder="Mail"
                disabled={formSaving}
              />
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
        title="Postfach entfernen"
        message={deleting ? `"${deleting.name}" wirklich entfernen? Das gespeicherte Passwort wird ebenfalls gelöscht.` : ''}
        confirmLabel="Entfernen"
        variant="danger"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
