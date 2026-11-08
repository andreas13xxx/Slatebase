import { useState, useEffect, type FormEvent } from 'react'
import { useAuthContext } from '../state/authContext'
import { useTranslation } from '../i18n'
import type { IApiClient } from '../api'
import type { PublicUserInfo } from '../state/authState'
import { SlatebaseLogo } from './SlatebaseLogo'
import { PasswordInput } from './PasswordInput'
import { createAccountApi } from '../account/accountApi'
import type { AccountApiError, AuthCapabilities } from '../account/accountApi'
import {
  cancelPasskeyPrompt,
  isPasskeyAutofillSupported,
  isPasskeyCancelled,
  isPasskeySupported,
  signInWithPasskey,
} from '../account/passkeyClient'
import '../account/account.css'

/** Props for the LoginPage component. */
export interface LoginPageProps {
  apiClient: IApiClient
}

/**
 * Checks if an error represents a 429 rate-limit response.
 */
function isRateLimitError(err: unknown): boolean {
  if (err !== null && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code
    return code === 'RATE_LIMITED' || code === 'TOO_MANY_REQUESTS'
  }
  return false
}

/**
 * Extracts the retry-after value (in seconds) from a rate-limit error.
 * Falls back to 900 seconds (15 minutes) if not available.
 */
function extractRetryAfter(err: unknown): number {
  if (err !== null && typeof err === 'object' && 'retryAfter' in err) {
    const retryAfter = (err as { retryAfter: unknown }).retryAfter
    if (typeof retryAfter === 'number' && retryAfter > 0) return retryAfter
  }
  if (err !== null && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: string }).message
    const match = message.match(/(\d+)\s*(seconds?|Sekunden?)/)
    if (match?.[1]) return parseInt(match[1], 10)
  }
  return 900
}

/**
 * Login page with Slatebase logo and modern card design.
 */
export function LoginPage({ apiClient }: LoginPageProps) {
  const { authState, authDispatch } = useAuthContext()
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [accountApi] = useState(() => createAccountApi())
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null)
  const [view, setView] = useState<'login' | 'forgot'>('login')
  const [forgotIdentifier, setForgotIdentifier] = useState('')
  const [forgotBusy, setForgotBusy] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)

  const passkeyAvailable = capabilities?.passkey === true && isPasskeySupported()

  /** Finishes a login (password or passkey): CSRF token into the client, user into the auth state. */
  function completeLogin(result: { csrfToken: string; user: PublicUserInfo }): void {
    apiClient.setCsrfToken(result.csrfToken)
    authDispatch({ type: 'LOGIN_SUCCESS', payload: { csrfToken: result.csrfToken, user: result.user } })
  }

  useEffect(() => {
    let cancelled = false
    accountApi.getCapabilities()
      .then((caps) => { if (!cancelled) setCapabilities(caps) })
      .catch(() => { /* capabilities are optional: without them the page offers the password login only */ })
    return () => { cancelled = true }
  }, [accountApi])

  // Conditional UI: offer saved passkeys in the username field's autofill list.
  useEffect(() => {
    if (!passkeyAvailable || view !== 'login') return
    let cancelled = false
    void isPasskeyAutofillSupported().then(async (supported) => {
      if (!supported || cancelled) return
      try {
        const result = await signInWithPasskey(accountApi, true)
        if (!cancelled) completeLogin(result)
      } catch {
        // dismissed, superseded by a password login or the explicit button: nothing to report
      }
    })
    return () => {
      cancelled = true
      cancelPasskeyPrompt()
    }
    // completeLogin only closes over the stable dispatch and client references
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passkeyAvailable, view, accountApi])

  useEffect(() => {
    const controller = new AbortController()
    apiClient.getVersion()
      .then((result) => {
        if (!controller.signal.aborted) {
          setVersion(result.version)
        }
      })
      .catch(() => {
        // Silently ignore — version display is non-critical
      })
    return () => { controller.abort() }
  }, [apiClient])

  function validate(): boolean {
    let valid = true
    if (username.trim() === '') {
      setUsernameError(t('auth.usernameRequired'))
      valid = false
    } else {
      setUsernameError(null)
    }
    if (password === '') {
      setPasswordError(t('auth.passwordRequired'))
      valid = false
    } else {
      setPasswordError(null)
    }
    return valid
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setRateLimitMessage(null)
    setPasskeyError(null)
    if (!validate()) return
    cancelPasskeyPrompt()
    authDispatch({ type: 'LOGIN_STARTED' })
    try {
      const result = await apiClient.login(username, password)
      completeLogin(result)
    } catch (err: unknown) {
      if (isRateLimitError(err)) {
        const retryAfter = extractRetryAfter(err)
        const msg = t('auth.rateLimited', { seconds: retryAfter })
        setRateLimitMessage(msg)
        authDispatch({ type: 'LOGIN_FAILED', payload: { message: msg } })
      } else {
        authDispatch({
          type: 'LOGIN_FAILED',
          payload: { message: t('auth.loginFailed') },
        })
      }
    }
  }

  async function handlePasskeyLogin(): Promise<void> {
    setPasskeyError(null)
    setRateLimitMessage(null)
    setPasskeyBusy(true)
    cancelPasskeyPrompt()
    try {
      const result = await signInWithPasskey(accountApi, false)
      completeLogin(result)
    } catch (err: unknown) {
      const apiError = err as AccountApiError
      if (apiError.code === 'RATE_LIMITED') {
        setPasskeyError(t('auth.rateLimited', { seconds: apiError.retryAfter ?? 900 }))
      } else if (apiError.code === 'ACCOUNT_SUSPENDED') {
        setPasskeyError(t('auth.loginFailed'))
      } else if (!isPasskeyCancelled(err)) {
        setPasskeyError(t('account.passkeyLoginFailed'))
      }
    } finally {
      setPasskeyBusy(false)
    }
  }

  async function handleForgotSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setForgotError(null)
    if (forgotIdentifier.trim() === '') return
    setForgotBusy(true)
    try {
      await accountApi.requestPasswordReset(forgotIdentifier.trim())
      setForgotSent(true)
    } catch (err: unknown) {
      const apiError = err as AccountApiError
      setForgotError(
        apiError.code === 'RATE_LIMITED'
          ? t('account.rateLimited', { seconds: apiError.retryAfter ?? 900 })
          : t('account.forgotFailed'),
      )
    } finally {
      setForgotBusy(false)
    }
  }

  if (view === 'forgot') {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <SlatebaseLogo size={36} className="login-logo-icon" />
            <span className="login-logo-text">Slatebase</span>
          </div>
          <h1 className="login-title">{t('account.forgotTitle')}</h1>
          {forgotSent ? (
            <p className="login-success" role="status">{t('account.forgotSent')}</p>
          ) : (
            <form className="login-form" onSubmit={(e) => void handleForgotSubmit(e)} noValidate>
              <p className="login-info">{t('account.forgotInfo')}</p>
              <div className="login-field">
                <label className="login-label" htmlFor="forgot-identifier">{t('account.forgotIdentifier')}</label>
                <input
                  id="forgot-identifier"
                  className="login-input"
                  type="text"
                  maxLength={254}
                  value={forgotIdentifier}
                  onChange={(e) => setForgotIdentifier(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
              {forgotError !== null && <p className="login-error" role="alert">{forgotError}</p>}
              <button type="submit" className="login-submit" disabled={forgotBusy || forgotIdentifier.trim() === ''}>
                {forgotBusy ? t('account.forgotSending') : t('account.forgotSubmit')}
              </button>
            </form>
          )}
          <p className="login-links">
            <button
              type="button"
              className="login-link-button"
              onClick={() => { setView('login'); setForgotSent(false); setForgotError(null) }}
            >
              {t('account.backToLogin')}
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <SlatebaseLogo size={36} className="login-logo-icon" />
          <span className="login-logo-text">Slatebase</span>
        </div>

        {authState.error === 'auth.sessionExpired' && (
          <div className="login-session-expired-banner" role="alert">
            {t('auth.sessionExpiredBanner')}
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-field">
            <label className="login-label" htmlFor="login-username">{t('auth.username')}</label>
            <input
              id="login-username"
              className="login-input"
              type="text"
              maxLength={128}
              value={username}
              onChange={(e) => { setUsername(e.target.value); if (usernameError) setUsernameError(null) }}
              aria-invalid={usernameError !== null}
              aria-describedby={usernameError ? 'login-username-error' : undefined}
              autoComplete={passkeyAvailable ? 'username webauthn' : 'username'}
              autoFocus
            />
            {usernameError && (
              <p id="login-username-error" className="login-field-error" role="alert">{usernameError}</p>
            )}
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="login-password">{t('auth.password')}</label>
            <PasswordInput
              id="login-password"
              className="login-input"
              maxLength={256}
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(null) }}
              aria-invalid={passwordError !== null}
              aria-describedby={passwordError ? 'login-password-error' : undefined}
              autoComplete="current-password"
            />
            {passwordError && (
              <p id="login-password-error" className="login-field-error" role="alert">{passwordError}</p>
            )}
          </div>

          {rateLimitMessage && (
            <p className="login-error login-error--rate-limit" role="alert">{rateLimitMessage}</p>
          )}
          {authState.error && !rateLimitMessage && authState.error !== 'auth.sessionExpired' && (
            <p className="login-error" role="alert">{
              authState.error.startsWith('auth.') ? t(authState.error as Parameters<typeof t>[0]) : authState.error
            }</p>
          )}

          <button type="submit" className="login-submit" disabled={authState.isLoading}>
            {authState.isLoading ? t('auth.loggingIn') : t('auth.login')}
          </button>
        </form>

        {passkeyAvailable && (
          <>
            <button
              type="button"
              className="login-secondary"
              onClick={() => void handlePasskeyLogin()}
              disabled={passkeyBusy || authState.isLoading}
            >
              {t('account.passkeyLogin')}
            </button>
            {passkeyError !== null && <p className="login-error" role="alert">{passkeyError}</p>}
          </>
        )}

        {capabilities?.passwordReset === true && (
          <p className="login-links">
            <button type="button" className="login-link-button" onClick={() => setView('forgot')}>
              {t('account.forgotPassword')}
            </button>
          </p>
        )}

        {version && (
          <p className="login-version">
            {version === 'development' ? 'dev' : `v${version}`}
          </p>
        )}
      </div>
    </div>
  )
}
