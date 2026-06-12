import { useState, type FormEvent } from 'react'
import { useAuthContext } from '../state/authContext'
import { useTranslation } from '../i18n'
import type { IApiClient } from '../api'
import { SlatebaseLogo } from './SlatebaseLogo'

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
    if (!validate()) return
    authDispatch({ type: 'LOGIN_STARTED' })
    try {
      const result = await apiClient.login(username, password)
      apiClient.setToken(result.token)
      apiClient.setCsrfToken(result.csrfToken)
      authDispatch({
        type: 'LOGIN_SUCCESS',
        payload: { token: result.token, csrfToken: result.csrfToken, user: result.user },
      })
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
              autoComplete="username"
              autoFocus
            />
            {usernameError && (
              <p id="login-username-error" className="login-field-error" role="alert">{usernameError}</p>
            )}
          </div>

          <div className="login-field">
            <label className="login-label" htmlFor="login-password">{t('auth.password')}</label>
            <input
              id="login-password"
              className="login-input"
              type="password"
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
          {authState.error && !rateLimitMessage && (
            <p className="login-error" role="alert">{
              authState.error.startsWith('auth.') ? t(authState.error as Parameters<typeof t>[0]) : authState.error
            }</p>
          )}

          <button type="submit" className="login-submit" disabled={authState.isLoading}>
            {authState.isLoading ? t('auth.loggingIn') : t('auth.login')}
          </button>
        </form>
      </div>
    </div>
  )
}
