import { useEffect, useState, type FormEvent } from 'react'
import type { IApiClient } from '../api'
import { useTranslation } from '../i18n'
import { Button, SettingSection } from '../components/settings/ui'
import { PasswordInput } from '../components/PasswordInput'
import { createAccountApi } from './accountApi'
import type { AccountApiError, AccountSettingsView, SmtpSettings } from './accountApi'
import './account.css'

export interface AdminAccountSettingsSectionProps {
  apiClient: IApiClient
}

type Message = { kind: 'success' | 'error'; text: string }

/**
 * Admin panel for the mail recovery and passkey settings: SMTP delivery,
 * the base URL used in mailed links and the optional shared passkey domain.
 */
export function AdminAccountSettingsSection({ apiClient }: AdminAccountSettingsSectionProps) {
  const { t } = useTranslation()
  const [api] = useState(() => createAccountApi(() => apiClient.getCsrfToken()))
  const [view, setView] = useState<AccountSettingsView | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const [smtp, setSmtp] = useState<SmtpSettings>({ host: '', port: 587, encryption: 'starttls', username: '', from: '' })
  const [smtpPassword, setSmtpPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [mailBaseUrl, setMailBaseUrl] = useState('')
  const [passkeyRpId, setPasskeyRpId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<Message | null>(null)

  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<Message | null>(null)

  function apply(next: AccountSettingsView): void {
    setView(next)
    setSmtp(next.smtp)
    setMailBaseUrl(next.mailBaseUrl)
    setPasskeyRpId(next.passkeyRpId)
    setSmtpPassword('')
    setClearPassword(false)
  }

  useEffect(() => {
    let cancelled = false
    api.getAccountSettings()
      .then((next) => { if (!cancelled) apply(next) })
      .catch(() => { if (!cancelled) setLoadFailed(true) })
    return () => { cancelled = true }
  }, [api])

  async function handleSave(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setSaveMessage(null)
    setSaving(true)
    try {
      const password = clearPassword ? '' : smtpPassword !== '' ? smtpPassword : undefined
      const next = await api.updateAccountSettings({
        smtp: { ...smtp, port: Number(smtp.port) },
        mailBaseUrl,
        passkeyRpId: passkeyRpId.trim(),
        ...(password !== undefined ? { smtpPassword: password } : {}),
      })
      apply(next)
      setSaveMessage({ kind: 'success', text: t('account.admin.saved') })
    } catch (err) {
      setSaveMessage({ kind: 'error', text: (err as AccountApiError).message || t('account.admin.saveFailed') })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(): Promise<void> {
    setTestMessage(null)
    setTesting(true)
    try {
      await api.sendTestMail(testTo.trim())
      setTestMessage({ kind: 'success', text: t('account.admin.testOk') })
    } catch (err) {
      setTestMessage({ kind: 'error', text: t('account.admin.testFailed', { message: (err as AccountApiError).message }) })
    } finally {
      setTesting(false)
    }
  }

  if (loadFailed) {
    return <p className="admin-users-message admin-users-message--error" role="alert">{t('account.admin.loadFailed')}</p>
  }
  if (view === null) return null

  return (
    <SettingSection title={t('account.admin.title')} description={t('account.admin.intro')}>
      <form className="account-form" onSubmit={(e) => void handleSave(e)}>
        <div className="account-field">
          <label htmlFor="acct-smtp-host">{t('account.admin.smtpHost')}</label>
          <input id="acct-smtp-host" value={smtp.host} maxLength={253} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} />
        </div>
        <div className="account-field">
          <label htmlFor="acct-smtp-port">{t('account.admin.smtpPort')}</label>
          <input
            id="acct-smtp-port"
            type="number"
            min={1}
            max={65535}
            value={smtp.port}
            onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })}
          />
        </div>
        <div className="account-field">
          <label htmlFor="acct-smtp-enc">{t('account.admin.smtpEncryption')}</label>
          <select
            id="acct-smtp-enc"
            value={smtp.encryption}
            onChange={(e) => setSmtp({ ...smtp, encryption: e.target.value as SmtpSettings['encryption'] })}
          >
            <option value="starttls">{t('account.admin.smtpEncryptionStarttls')}</option>
            <option value="tls">{t('account.admin.smtpEncryptionTls')}</option>
            <option value="none">{t('account.admin.smtpEncryptionNone')}</option>
          </select>
        </div>
        <div className="account-field">
          <label htmlFor="acct-smtp-user">{t('account.admin.smtpUsername')}</label>
          <input id="acct-smtp-user" value={smtp.username} maxLength={254} autoComplete="off" onChange={(e) => setSmtp({ ...smtp, username: e.target.value })} />
        </div>
        <div className="account-field">
          <label htmlFor="acct-smtp-pass">{t('account.admin.smtpPassword')}</label>
          <PasswordInput
            id="acct-smtp-pass"
            value={smtpPassword}
            maxLength={1024}
            autoComplete="new-password"
            disabled={clearPassword}
            onChange={(e) => setSmtpPassword(e.target.value)}
          />
          {view.smtpPasswordSet && (
            <>
              <p className="account-field-hint">{t('account.admin.smtpPasswordSet')}</p>
              <label className="account-field-hint">
                <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} />{' '}
                {t('account.admin.smtpPasswordClear')}
              </label>
            </>
          )}
        </div>
        <div className="account-field">
          <label htmlFor="acct-smtp-from">{t('account.admin.smtpFrom')}</label>
          <input
            id="acct-smtp-from"
            value={smtp.from}
            maxLength={254}
            placeholder="Slatebase <no-reply@example.org>"
            onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
          />
        </div>

        <div className="account-field">
          <label htmlFor="acct-base-url">{t('account.admin.mailBaseUrl')}</label>
          <select id="acct-base-url" value={mailBaseUrl} onChange={(e) => setMailBaseUrl(e.target.value)}>
            <option value="">{t('account.admin.mailBaseUrlAuto')}</option>
            {view.allowedOrigins.filter((o) => o.startsWith('https:')).map((origin) => (
              <option key={origin} value={origin}>{origin}</option>
            ))}
          </select>
          <p className="account-field-hint">
            {view.resolvedMailBaseUrl === null
              ? t('account.admin.mailBaseUrlNone')
              : t('account.admin.mailBaseUrlResolved', { url: view.resolvedMailBaseUrl })}
          </p>
        </div>

        <div className="account-field">
          <label htmlFor="acct-rpid">{t('account.admin.passkeyRpId')}</label>
          <input
            id="acct-rpid"
            value={passkeyRpId}
            maxLength={253}
            placeholder="example.org"
            autoComplete="off"
            onChange={(e) => setPasskeyRpId(e.target.value)}
          />
          <p className="account-field-hint">{t('account.admin.passkeyRpIdHint')}</p>
          <p className="account-field-hint">{t('account.admin.origins', { origins: view.allowedOrigins.join(', ') })}</p>
        </div>

        <div className="account-form-actions">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? t('account.admin.saving') : t('account.admin.save')}
          </Button>
        </div>
        {saveMessage !== null && (
          <p className={`admin-users-message admin-users-message--${saveMessage.kind}`} role={saveMessage.kind === 'error' ? 'alert' : 'status'}>
            {saveMessage.text}
          </p>
        )}
      </form>

      <div className="account-form">
        <div className="account-field">
          <label htmlFor="acct-test-to">{t('account.admin.testTo')}</label>
          <input id="acct-test-to" type="email" value={testTo} maxLength={254} onChange={(e) => setTestTo(e.target.value)} />
        </div>
        <div className="account-form-actions">
          <Button onClick={() => void handleTest()} disabled={testing || testTo.trim() === ''}>
            {testing ? t('account.admin.testSending') : t('account.admin.testSend')}
          </Button>
        </div>
        {testMessage !== null && (
          <p className={`admin-users-message admin-users-message--${testMessage.kind}`} role={testMessage.kind === 'error' ? 'alert' : 'status'}>
            {testMessage.text}
          </p>
        )}
      </div>
    </SettingSection>
  )
}
