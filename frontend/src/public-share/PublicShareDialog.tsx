import { useCallback, useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import type { IApiClient } from '../api'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { extractErrorMessage } from '../utils/error'
import { PasswordInput } from '../components/PasswordInput'
import { showToast } from '../components/ToastNotification'
import { formatShareDate, kindLabel, linkUrl, toExpiryIso } from './publicShareFormat'
import type { CreatedPublicShare, EmbedPreviewEntry, PublicShareSummary } from './types'
import './PublicShareDialog.css'

interface PublicShareDialogProps {
  apiClient: IApiClient
  vaultId: string
  /** Vault path of the note to share. */
  filePath: string
  onClose: () => void
}

/**
 * Dialog for the public link of one note: create it, see what it includes, set a password
 * and expiry, and revoke it. The token is only returned when a link is created, so an
 * existing link is managed here but its URL cannot be shown again — "Neuen Link erzeugen"
 * replaces it.
 */
export function PublicShareDialog({ apiClient, vaultId, filePath, onClose }: PublicShareDialogProps) {
  const [existing, setExisting] = useState<PublicShareSummary | null>(null)
  const [embeds, setEmbeds] = useState<EmbedPreviewEntry[]>([])
  const [created, setCreated] = useState<CreatedPublicShare | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [password, setPassword] = useState('')
  const [expiry, setExpiry] = useState('')

  const titleId = useId()
  const passwordId = useId()
  const expiryId = useId()
  const urlId = useId()
  const containerRef = useFocusTrap<HTMLDivElement>({ isActive: true, onEscape: onClose, returnFocusOnDeactivate: true })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [shares, preview] = await Promise.all([
        apiClient.listPublicShares(vaultId),
        apiClient.previewPublicShare(vaultId, filePath),
      ])
      setExisting(shares.find((s) => s.filePath === filePath) ?? null)
      setEmbeds(preview)
    } catch (err) {
      setError(extractErrorMessage(err, 'Der Stand der Freigabe konnte nicht geladen werden.'))
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId, filePath])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load on open
    void load()
  }, [load])

  const run = async (action: () => Promise<void>, failure: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(extractErrorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }

  const create = (event?: FormEvent): Promise<void> => {
    event?.preventDefault()
    return run(async () => {
      const result = await apiClient.createPublicShare(vaultId, {
        path: filePath,
        ...(password !== '' ? { password } : {}),
        ...(expiry !== '' ? { expiresAt: toExpiryIso(expiry) } : {}),
      })
      setCreated(result)
      setExisting(result.share)
      setPassword('')
      setExpiry('')
    }, 'Der Link konnte nicht erzeugt werden.')
  }

  const revoke = (): Promise<void> =>
    run(async () => {
      if (existing === null) return
      await apiClient.revokePublicShare(vaultId, existing.id)
      setExisting(null)
      setCreated(null)
      showToast('success', 'Der Link wurde widerrufen.')
    }, 'Der Link konnte nicht widerrufen werden.')

  const replace = (): Promise<void> =>
    run(async () => {
      if (existing === null) return
      // One atomic step on the server: the old URL stops working and password and expiry stay.
      const result = await apiClient.regeneratePublicShare(vaultId, existing.id)
      setCreated(result)
      setExisting(result.share)
    }, 'Der Link konnte nicht erneuert werden.')

  const update = (input: { password?: string | null; expiresAt?: string | null }): Promise<void> =>
    run(async () => {
      if (existing === null) return
      setExisting(await apiClient.updatePublicShare(vaultId, existing.id, input))
      setPassword('')
      setExpiry('')
    }, 'Die Änderung konnte nicht gespeichert werden.')

  const copy = async (): Promise<void> => {
    if (created === null) return
    try {
      await navigator.clipboard.writeText(linkUrl(created.path))
      setCopied(true)
      showToast('success', 'Link kopiert.')
    } catch {
      showToast('error', 'Der Link konnte nicht kopiert werden. Markiere ihn und kopiere ihn von Hand.')
    }
  }

  const fileName = filePath.slice(filePath.lastIndexOf('/') + 1)

  return (
    <div className="confirm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }} role="presentation">
      <div
        ref={containerRef}
        className="confirm-modal public-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="confirm-modal-header">
          <span className="confirm-modal-icon"><Link2 size={18} aria-hidden="true" /></span>
          <h2 id={titleId} className="confirm-modal-title">Öffentlicher Link: {fileName}</h2>
        </div>

        <p className="public-share-dialog__hint">
          Jede Person mit dem Link kann diese Notiz lesen, auch ohne Konto. Der Link zeigt immer den aktuellen Stand der Notiz.
        </p>

        {error !== null && <p role="alert" className="public-share-dialog__error">{error}</p>}

        {loading ? (
          <p role="status">Wird geladen…</p>
        ) : (
          <>
            <EmbedPreview embeds={embeds} />

            {created !== null && (
              <div className="public-share-dialog__created">
                <label htmlFor={urlId}>Dein Link (wird nur jetzt angezeigt)</label>
                <div className="public-share-dialog__row">
                  <input id={urlId} readOnly value={linkUrl(created.path)} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={() => { void copy() }}>
                    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} Kopieren
                  </button>
                </div>
              </div>
            )}

            {existing === null ? (
              <form onSubmit={(e) => { void create(e) }} className="public-share-dialog__form">
                <label htmlFor={passwordId}>Passwort (optional)</label>
                <PasswordInput id={passwordId} value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
                <label htmlFor={expiryId}>Gültig bis (optional)</label>
                <input id={expiryId} type="date" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiry(e.target.value)} />
                <p className="public-share-dialog__hint">Ein Passwort braucht mindestens 8 Zeichen.</p>
                <div className="confirm-modal-actions">
                  <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={onClose}>Schließen</button>
                  <button type="submit" className="confirm-modal-btn confirm-modal-btn--primary" disabled={busy}>Link erzeugen</button>
                </div>
              </form>
            ) : (
              <ExistingLink
                share={existing}
                busy={busy}
                password={password}
                expiry={expiry}
                passwordId={passwordId}
                expiryId={expiryId}
                onPassword={setPassword}
                onExpiry={setExpiry}
                onUpdate={update}
                onRevoke={revoke}
                onReplace={replace}
                onClose={onClose}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function EmbedPreview({ embeds }: { embeds: EmbedPreviewEntry[] }) {
  if (embeds.length === 0) return null
  const unavailable = embeds.filter((e) => e.kind === 'unavailable')
  return (
    <section className="public-share-dialog__embeds" aria-label="Eingebettete Inhalte">
      <h3>Der Link enthält zusätzlich</h3>
      <ul>
        {embeds.filter((e) => e.kind !== 'unavailable').map((e) => (
          <li key={e.ref}>{e.ref} <span className="public-share-dialog__kind">({kindLabel(e.kind)})</span></li>
        ))}
      </ul>
      {unavailable.length > 0 && (
        <>
          <p className="public-share-dialog__hint">
            Diese Einbettungen sind nicht verfügbar (fehlen, sind nicht lesbar oder sind Bases/Canvas) und erscheinen als Hinweis:
          </p>
          <ul>{unavailable.map((e) => <li key={e.ref}>{e.ref}</li>)}</ul>
        </>
      )}
    </section>
  )
}

interface ExistingLinkProps {
  share: PublicShareSummary
  busy: boolean
  password: string
  expiry: string
  passwordId: string
  expiryId: string
  onPassword: (value: string) => void
  onExpiry: (value: string) => void
  onUpdate: (input: { password?: string | null; expiresAt?: string | null }) => Promise<void>
  onRevoke: () => Promise<void>
  onReplace: () => Promise<void>
  onClose: () => void
}

function ExistingLink({ share, busy, password, expiry, passwordId, expiryId, onPassword, onExpiry, onUpdate, onRevoke, onReplace, onClose }: ExistingLinkProps) {
  return (
    <div className="public-share-dialog__existing">
      <dl className="public-share-dialog__facts">
        <dt>Erstellt</dt><dd>{formatShareDate(share.createdAt)}</dd>
        <dt>Gültig bis</dt><dd>{share.expiresAt !== undefined ? formatShareDate(share.expiresAt) : 'unbegrenzt'}</dd>
        <dt>Passwort</dt><dd>{share.passwordProtected ? 'ja' : 'nein'}</dd>
        <dt>Zuletzt abgerufen</dt><dd>{share.lastAccessAt !== undefined ? formatShareDate(share.lastAccessAt) : 'noch nie'}</dd>
        <dt>Endung</dt><dd>…{share.tokenHint}</dd>
      </dl>

      <label htmlFor={passwordId}>Neues Passwort</label>
      <PasswordInput id={passwordId} value={password} autoComplete="new-password" onChange={(e) => onPassword(e.target.value)} />
      <div className="public-share-dialog__row">
        <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" disabled={busy || password === ''} onClick={() => { void onUpdate({ password }) }}>
          Passwort setzen
        </button>
        {share.passwordProtected && (
          <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" disabled={busy} onClick={() => { void onUpdate({ password: null }) }}>
            Passwort entfernen
          </button>
        )}
      </div>

      <label htmlFor={expiryId}>Neues Ablaufdatum</label>
      <input id={expiryId} type="date" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={(e) => onExpiry(e.target.value)} />
      <div className="public-share-dialog__row">
        <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" disabled={busy || expiry === ''} onClick={() => { void onUpdate({ expiresAt: toExpiryIso(expiry) }) }}>
          Ablaufdatum setzen
        </button>
        {share.expiresAt !== undefined && (
          <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" disabled={busy} onClick={() => { void onUpdate({ expiresAt: null }) }}>
            Ablauf entfernen
          </button>
        )}
      </div>

      <div className="confirm-modal-actions">
        <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={onClose}>Schließen</button>
        <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" disabled={busy} onClick={() => { void onReplace() }}>
          Neuen Link erzeugen
        </button>
        <button type="button" className="confirm-modal-btn confirm-modal-btn--danger" disabled={busy} onClick={() => { void onRevoke() }}>
          Link widerrufen
        </button>
      </div>
    </div>
  )
}
