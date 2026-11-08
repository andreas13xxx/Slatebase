import { useEffect, useState, type FormEvent } from 'react'
import type { IApiClient } from '../api'
import { useTranslation } from '../i18n'
import { ConfirmModal } from '../components/ConfirmModal'
import { PasswordInput } from '../components/PasswordInput'
import { Button, SettingRow, SettingSection } from '../components/settings/ui'
import { createAccountApi } from './accountApi'
import type { AccountApiError, AuthCapabilities, PasskeyInfo, SecurityOverview } from './accountApi'
import { isPasskeyCancelled, isPasskeySupported, registerPasskey, suggestPasskeyName } from './passkeyClient'
import './account.css'

export interface SecuritySectionProps {
  apiClient: IApiClient
}

function errorCode(err: unknown): string {
  return err !== null && typeof err === 'object' && 'code' in err ? String((err as AccountApiError).code) : ''
}

/**
 * Settings → Security: confirmed email address (needed for the password reset by mail)
 * and passkey management.
 */
export function SecuritySection({ apiClient }: SecuritySectionProps) {
  const { t, locale } = useTranslation()
  const [api] = useState(() => createAccountApi(() => apiClient.getCsrfToken()))
  const [overview, setOverview] = useState<SecurityOverview | null>(null)
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailMessage, setEmailMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const [adding, setAdding] = useState(false)
  const [passkeyName, setPasskeyName] = useState(() => suggestPasskeyName())
  const [passkeyPassword, setPasskeyPassword] = useState('')
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyMessage, setPasskeyMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState<PasskeyInfo | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const refresh = (): void => setReloadKey((k) => k + 1)

  useEffect(() => {
    let cancelled = false
    api.getSecurity()
      .then((next) => {
        if (cancelled) return
        setOverview(next)
        setLoadError(null)
      })
      .catch(() => { if (!cancelled) setLoadError(t('account.admin.loadFailed')) })
    return () => { cancelled = true }
  }, [api, t, reloadKey])

  useEffect(() => {
    let cancelled = false
    api.getCapabilities()
      .then((caps) => { if (!cancelled) setCapabilities(caps) })
      .catch(() => { if (!cancelled) setCapabilities({ passwordReset: false, passkey: false }) })
    return () => { cancelled = true }
  }, [api])

  const formatDate = (iso: string): string => new Date(iso).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB')

  async function handleEmailSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setEmailMessage(null)
    setEmailBusy(true)
    try {
      await api.requestEmailChange(newEmail.trim(), emailPassword)
      setEmailMessage({ kind: 'success', text: t('account.security.emailSent') })
      setNewEmail('')
      setEmailPassword('')
      refresh()
    } catch (err) {
      const code = errorCode(err)
      setEmailMessage({
        kind: 'error',
        text: code === 'INVALID_PASSWORD' ? t('account.security.emailPasswordWrong') : (err as AccountApiError).message || t('account.security.emailFailed'),
      })
    } finally {
      setEmailBusy(false)
    }
  }

  async function handleAddPasskey(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setPasskeyMessage(null)
    setPasskeyBusy(true)
    try {
      await registerPasskey(api, passkeyPassword, passkeyName.trim())
      setPasskeyMessage({ kind: 'success', text: t('account.security.passkeysAdded') })
      setAdding(false)
      setPasskeyPassword('')
      refresh()
    } catch (err) {
      const code = errorCode(err)
      let text = t('account.security.passkeysFailed')
      if (isPasskeyCancelled(err)) text = t('account.security.passkeysCancelled')
      else if (code === 'INVALID_PASSWORD') text = t('account.security.emailPasswordWrong')
      else if (code === 'PASSKEY_LIMIT') text = t('account.security.passkeysLimit')
      else if (code === 'DUPLICATE_CREDENTIAL') text = t('account.security.passkeysDuplicate')
      setPasskeyMessage({ kind: 'error', text })
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function handleRename(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (renaming === null || renaming.name.trim() === '') return
    try {
      await api.renamePasskey(renaming.id, renaming.name.trim())
      setRenaming(null)
      refresh()
    } catch (err) {
      setPasskeyMessage({ kind: 'error', text: (err as AccountApiError).message || t('account.security.passkeysFailed') })
    }
  }

  async function handleDelete(): Promise<void> {
    if (deleting === null) return
    const target = deleting
    setDeleting(null)
    try {
      await api.deletePasskey(target.id)
      refresh()
    } catch (err) {
      setPasskeyMessage({ kind: 'error', text: (err as AccountApiError).message || t('account.security.passkeysFailed') })
    }
  }

  if (loadError !== null) {
    return <p className="admin-users-message admin-users-message--error" role="alert">{loadError}</p>
  }
  if (overview === null) return null

  const passkeyPossible = isPasskeySupported() && capabilities?.passkey === true

  return (
    <>
      <SettingSection title={t('account.security.emailTitle')} description={t('account.security.emailIntro')}>
        <SettingRow label={t('account.security.emailCurrent')}>
          <span>
            {overview.email === '' ? t('account.security.emailNone') : overview.email}
            {overview.email !== '' && (
              <span className={`account-badge ${overview.emailVerified ? 'account-badge--ok' : 'account-badge--warn'}`}>
                {overview.emailVerified ? t('account.security.emailVerified') : t('account.security.emailUnverified')}
              </span>
            )}
          </span>
        </SettingRow>

        {overview.pendingEmail !== null && (
          <p className="admin-users-message admin-users-message--info">
            {t('account.security.emailPending', { email: overview.pendingEmail })}
          </p>
        )}

        {overview.mailAvailable ? (
          <form className="account-form" onSubmit={(e) => void handleEmailSubmit(e)}>
            <div className="account-field">
              <label htmlFor="account-new-email">{t('account.security.emailNew')}</label>
              <input
                id="account-new-email"
                type="email"
                value={newEmail}
                maxLength={254}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="account-field">
              <label htmlFor="account-email-password">{t('account.security.emailPassword')}</label>
              <PasswordInput
                id="account-email-password"
                value={emailPassword}
                maxLength={256}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" variant="primary" disabled={emailBusy || newEmail.trim() === '' || emailPassword === ''}>
              {emailBusy ? t('account.security.emailSending') : t('account.security.emailSend')}
            </Button>
          </form>
        ) : (
          <p className="admin-users-message admin-users-message--info">{t('account.security.mailUnavailable')}</p>
        )}

        {emailMessage !== null && (
          <p className={`admin-users-message admin-users-message--${emailMessage.kind}`} role={emailMessage.kind === 'error' ? 'alert' : 'status'}>
            {emailMessage.text}
          </p>
        )}
      </SettingSection>

      <SettingSection title={t('account.security.passkeysTitle')} description={t('account.security.passkeysIntro')}>
        {!isPasskeySupported() && (
          <p className="admin-users-message admin-users-message--info">{t('account.security.passkeysUnsupported')}</p>
        )}
        {isPasskeySupported() && capabilities !== null && !capabilities.passkey && (
          <p className="admin-users-message admin-users-message--info">{t('account.security.passkeysUnavailable')}</p>
        )}

        {overview.passkeys.length === 0 ? (
          <p>{t('account.security.passkeysEmpty')}</p>
        ) : (
          <ul className="account-passkey-list">
            {overview.passkeys.map((p) => (
              <li key={p.id} className="account-passkey">
                {renaming?.id === p.id ? (
                  <form className="account-passkey-rename" onSubmit={(e) => void handleRename(e)}>
                    <input
                      aria-label={t('account.security.passkeysName')}
                      value={renaming.name}
                      maxLength={64}
                      onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                      autoFocus
                    />
                    <Button type="submit" size="sm" variant="primary">{t('account.security.passkeysSave')}</Button>
                    <Button size="sm" onClick={() => setRenaming(null)}>{t('account.security.passkeysCancel')}</Button>
                  </form>
                ) : (
                  <>
                    <div className="account-passkey-main">
                      <strong>{p.name}</strong>
                      <span className="account-passkey-meta">
                        {t('account.security.passkeysDomain', { domain: p.rpId })} · {t('account.security.passkeysCreated', { date: formatDate(p.createdAt) })} ·{' '}
                        {p.lastUsedAt === null ? t('account.security.passkeysNeverUsed') : t('account.security.passkeysLastUsed', { date: formatDate(p.lastUsedAt) })}
                      </span>
                    </div>
                    <div className="account-passkey-actions">
                      <Button size="sm" onClick={() => setRenaming({ id: p.id, name: p.name })}>{t('account.security.passkeysRename')}</Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleting(p)}>{t('account.security.passkeysDelete')}</Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {passkeyPossible && !adding && (
          <Button variant="primary" onClick={() => { setAdding(true); setPasskeyMessage(null) }}>
            {t('account.security.passkeysAdd')}
          </Button>
        )}

        {passkeyPossible && adding && (
          <form className="account-form" onSubmit={(e) => void handleAddPasskey(e)}>
            <div className="account-field">
              <label htmlFor="account-passkey-name">{t('account.security.passkeysName')}</label>
              <input
                id="account-passkey-name"
                value={passkeyName}
                maxLength={64}
                onChange={(e) => setPasskeyName(e.target.value)}
                required
              />
            </div>
            <div className="account-field">
              <label htmlFor="account-passkey-password">{t('account.security.passkeysPassword')}</label>
              <PasswordInput
                id="account-passkey-password"
                value={passkeyPassword}
                maxLength={256}
                onChange={(e) => setPasskeyPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="account-form-actions">
              <Button type="submit" variant="primary" disabled={passkeyBusy || passkeyName.trim() === '' || passkeyPassword === ''}>
                {passkeyBusy ? t('account.security.passkeysCreating') : t('account.security.passkeysCreate')}
              </Button>
              <Button onClick={() => setAdding(false)} disabled={passkeyBusy}>{t('account.security.passkeysCancel')}</Button>
            </div>
          </form>
        )}

        {passkeyMessage !== null && (
          <p className={`admin-users-message admin-users-message--${passkeyMessage.kind}`} role={passkeyMessage.kind === 'error' ? 'alert' : 'status'}>
            {passkeyMessage.text}
          </p>
        )}
      </SettingSection>

      <ConfirmModal
        open={deleting !== null}
        title={t('account.security.passkeysDelete')}
        message={deleting === null ? '' : t('account.security.passkeysDeleteConfirm', { name: deleting.name })}
        confirmLabel={t('account.security.passkeysDelete')}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
