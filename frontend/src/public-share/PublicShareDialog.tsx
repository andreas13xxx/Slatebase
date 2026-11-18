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
import { notifyPublicSharesChanged } from './publicShareEvents'
import { useTranslation } from '../i18n'
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
  const { t } = useTranslation()
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
      setError(extractErrorMessage(err, t('publicShare.dialog.loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [apiClient, vaultId, filePath, t])

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
      notifyPublicSharesChanged()
    }, t('publicShare.dialog.createFailed'))
  }

  const revoke = (): Promise<void> =>
    run(async () => {
      if (existing === null) return
      await apiClient.revokePublicShare(vaultId, existing.id)
      setExisting(null)
      setCreated(null)
      notifyPublicSharesChanged()
      showToast('success', t('publicShare.dialog.revoked'))
    }, t('publicShare.dialog.revokeFailed'))

  const replace = (): Promise<void> =>
    run(async () => {
      if (existing === null) return
      // One atomic step on the server: the old URL stops working and password and expiry stay.
      const result = await apiClient.regeneratePublicShare(vaultId, existing.id)
      setCreated(result)
      setExisting(result.share)
    }, t('publicShare.dialog.replaceFailed'))

  const update = (input: { password?: string | null; expiresAt?: string | null }): Promise<void> =>
    run(async () => {
      if (existing === null) return
      setExisting(await apiClient.updatePublicShare(vaultId, existing.id, input))
      setPassword('')
      setExpiry('')
    }, t('publicShare.dialog.updateFailed'))

  const copy = async (): Promise<void> => {
    if (created === null) return
    try {
      await navigator.clipboard.writeText(linkUrl(created.path))
      setCopied(true)
      showToast('success', t('publicShare.dialog.copied'))
    } catch {
      showToast('error', t('publicShare.dialog.copyFailed'))
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
          <h2 id={titleId} className="confirm-modal-title">{t('publicShare.dialog.title', { name: fileName })}</h2>
        </div>

        <p className="public-share-dialog__hint">
          {t('publicShare.dialog.hint')}
        </p>

        {error !== null && <p role="alert" className="public-share-dialog__error">{error}</p>}

        {loading ? (
          <p role="status">{t('publicShare.loading')}</p>
        ) : (
          <>
            <EmbedPreview embeds={embeds} />

            {created !== null && (
              <div className="public-share-dialog__created">
                <label htmlFor={urlId}>{t('publicShare.dialog.yourLink')}</label>
                <div className="public-share-dialog__row">
                  <input id={urlId} readOnly value={linkUrl(created.path)} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={() => { void copy() }}>
                    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {t('publicShare.dialog.copy')}
                  </button>
                </div>
              </div>
            )}

            {existing === null ? (
              <form onSubmit={(e) => { void create(e) }} className="public-share-dialog__form">
                <label htmlFor={passwordId}>{t('publicShare.dialog.passwordOptional')}</label>
                <PasswordInput id={passwordId} value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
                <label htmlFor={expiryId}>{t('publicShare.dialog.expiryOptional')}</label>
                <input id={expiryId} type="date" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiry(e.target.value)} />
                <p className="public-share-dialog__hint">{t('publicShare.dialog.passwordMinLength')}</p>
                <div className="confirm-modal-actions">
                  <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={onClose}>{t('publicShare.close')}</button>
                  <button type="submit" className="confirm-modal-btn confirm-modal-btn--primary" disabled={busy}>{t('publicShare.dialog.createLink')}</button>
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
  const { t } = useTranslation()
  if (embeds.length === 0) return null
  const unavailable = embeds.filter((e) => e.kind === 'unavailable')
  return (
    <section className="public-share-dialog__embeds" aria-label={t('publicShare.dialog.embedsLabel')}>
      <h3>{t('publicShare.dialog.embedsTitle')}</h3>
      <ul>
        {embeds.filter((e) => e.kind !== 'unavailable').map((e) => (
          <li key={e.ref}>{e.ref} <span className="public-share-dialog__kind">({kindLabel(e.kind)})</span></li>
        ))}
      </ul>
      {unavailable.length > 0 && (
        <>
          <p className="public-share-dialog__hint">
            {t('publicShare.dialog.embedsUnavailable')}
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
  const { t } = useTranslation()
  return (
    <div className="public-share-dialog__existing">
      <dl className="public-share-dialog__facts">
        <dt>{t('publicShare.created')}</dt><dd>{formatShareDate(share.createdAt)}</dd>
        <dt>{t('publicShare.validUntil')}</dt><dd>{share.expiresAt !== undefined ? formatShareDate(share.expiresAt) : t('publicShare.unlimited')}</dd>
        <dt>{t('publicShare.password')}</dt><dd>{share.passwordProtected ? t('publicShare.yes') : t('publicShare.no')}</dd>
        <dt>{t('publicShare.lastAccess')}</dt><dd>{share.lastAccessAt !== undefined ? formatShareDate(share.lastAccessAt) : t('publicShare.never')}</dd>
        <dt>{t('publicShare.dialog.tokenEnding')}</dt><dd>…{share.tokenHint}</dd>
      </dl>

      <label htmlFor={passwordId}>{t('publicShare.dialog.newPassword')}</label>
      <PasswordInput id={passwordId} value={password} autoComplete="new-password" onChange={(e) => onPassword(e.target.value)} />
      <div className="public-share-dialog__row">
        <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" disabled={busy || password === ''} onClick={() => { void onUpdate({ password }) }}>
          {t('publicShare.dialog.setPassword')}
        </button>
        {share.passwordProtected && (
          <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" disabled={busy} onClick={() => { void onUpdate({ password: null }) }}>
            {t('publicShare.dialog.removePassword')}
          </button>
        )}
      </div>

      <label htmlFor={expiryId}>{t('publicShare.dialog.newExpiry')}</label>
      <input id={expiryId} type="date" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={(e) => onExpiry(e.target.value)} />
      <div className="public-share-dialog__row">
        <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" disabled={busy || expiry === ''} onClick={() => { void onUpdate({ expiresAt: toExpiryIso(expiry) }) }}>
          {t('publicShare.dialog.setExpiry')}
        </button>
        {share.expiresAt !== undefined && (
          <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" disabled={busy} onClick={() => { void onUpdate({ expiresAt: null }) }}>
            {t('publicShare.dialog.removeExpiry')}
          </button>
        )}
      </div>

      <div className="confirm-modal-actions">
        <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" onClick={onClose}>{t('publicShare.close')}</button>
        <button type="button" className="confirm-modal-btn confirm-modal-btn--cancel" disabled={busy} onClick={() => { void onReplace() }}>
          {t('publicShare.dialog.newLink')}
        </button>
        <button type="button" className="confirm-modal-btn confirm-modal-btn--danger" disabled={busy} onClick={() => { void onRevoke() }}>
          {t('publicShare.dialog.revokeLink')}
        </button>
      </div>
    </div>
  )
}
