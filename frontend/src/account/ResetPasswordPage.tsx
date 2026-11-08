import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from '../i18n'
import { PasswordInput } from '../components/PasswordInput'
import { SlatebaseLogo } from '../components/SlatebaseLogo'
import { createAccountApi, readFragmentToken } from './accountApi'
import type { AccountApiError } from './accountApi'
import './account.css'

/**
 * Landing page of the mailed reset link (`/reset-password#token=…`).
 * Public: no session is needed, and the token never leaves the fragment until it is posted.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const [api] = useState(() => createAccountApi())
  const [token] = useState(() => readFragmentToken(window.location.hash))

  // Remove the token from the address bar once it is held in state (kept out of the
  // state initializer so a repeated initializer call under StrictMode still sees it).
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname)
  }, [])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setError(null)
    if (token === null) return
    if (password.length < 8) {
      setError(t('auth.newPasswordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('auth.passwordsDoNotMatch'))
      return
    }
    setBusy(true)
    try {
      await api.confirmPasswordReset(token, password)
      setDone(true)
    } catch (err) {
      const code = (err as AccountApiError).code
      if (code === 'INVALID_TOKEN') setError(t('account.resetInvalid'))
      else if (code === 'PASSWORD_TOO_SHORT') setError(t('auth.newPasswordTooShort'))
      else if (code === 'RATE_LIMITED') setError(t('account.rateLimited', { seconds: (err as AccountApiError).retryAfter ?? 900 }))
      else setError(t('account.resetFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <SlatebaseLogo size={36} className="login-logo-icon" />
          <span className="login-logo-text">Slatebase</span>
        </div>
        <h1 className="login-title">{t('account.resetTitle')}</h1>

        {token === null && !done && (
          <>
            <p className="login-error" role="alert">{t('account.resetInvalid')}</p>
            <p className="login-links">
              <a href="/">{t('account.backToLogin')}</a>
            </p>
          </>
        )}

        {done && (
          <>
            <p className="login-success" role="status">{t('account.resetDone')}</p>
            <p className="login-links">
              <a href="/">{t('account.backToLogin')}</a>
            </p>
          </>
        )}

        {token !== null && !done && (
          <form className="login-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
            <div className="login-field">
              <label className="login-label" htmlFor="reset-password">{t('auth.newPassword')}</label>
              <PasswordInput
                id="reset-password"
                className="login-input"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <div className="login-field">
              <label className="login-label" htmlFor="reset-confirm">{t('auth.confirmPassword')}</label>
              <PasswordInput
                id="reset-confirm"
                className="login-input"
                maxLength={128}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error !== null && <p className="login-error" role="alert">{error}</p>}
            <button type="submit" className="login-submit" disabled={busy}>
              {busy ? t('account.resetSaving') : t('account.resetSubmit')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
