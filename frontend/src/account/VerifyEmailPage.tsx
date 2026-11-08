import { useEffect, useState } from 'react'
import { useTranslation } from '../i18n'
import { SlatebaseLogo } from '../components/SlatebaseLogo'
import { createAccountApi, readFragmentToken } from './accountApi'
import type { AccountApiError } from './accountApi'
import './account.css'

type Status = 'working' | 'done' | 'invalid' | 'in-use'

/**
 * Landing page of the mailed confirmation link (`/verify-email#token=…`).
 * Works with or without a session; the token is posted once and removed from the address bar.
 */
export function VerifyEmailPage() {
  const { t } = useTranslation()
  const [token] = useState(() => readFragmentToken(window.location.hash))
  const [status, setStatus] = useState<Status>(token === null ? 'invalid' : 'working')

  // Remove the token from the address bar once it is held in state (kept out of the
  // state initializer so a repeated initializer call under StrictMode still sees it).
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  useEffect(() => {
    if (token === null) return
    let cancelled = false
    createAccountApi().verifyEmail(token)
      .then(() => { if (!cancelled) setStatus('done') })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus((err as AccountApiError).code === 'EMAIL_IN_USE' ? 'in-use' : 'invalid')
      })
    return () => { cancelled = true }
  }, [token])

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <SlatebaseLogo size={36} className="login-logo-icon" />
          <span className="login-logo-text">Slatebase</span>
        </div>
        <h1 className="login-title">{t('account.verifyTitle')}</h1>
        {status === 'working' && <p className="login-info" role="status">{t('account.verifyWorking')}</p>}
        {status === 'done' && <p className="login-success" role="status">{t('account.verifyDone')}</p>}
        {status === 'invalid' && <p className="login-error" role="alert">{t('account.verifyInvalid')}</p>}
        {status === 'in-use' && <p className="login-error" role="alert">{t('account.verifyInUse')}</p>}
        {status !== 'working' && (
          <p className="login-links">
            <a href="/">{t('account.continue')}</a>
          </p>
        )}
      </div>
    </div>
  )
}
