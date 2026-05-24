import { useState, type FormEvent } from 'react'
import { useAuthContext } from '../state/authContext'
import type { IApiClient } from '../api'

/** Props for the LoginPage component. */
export interface LoginPageProps {
  /** API client instance for making login requests. */
  apiClient: IApiClient
}

/**
 * Login page component that handles user authentication.
 * Renders username and password fields with German labels,
 * performs client-side validation, and dispatches auth actions.
 */
export function LoginPage({ apiClient }: LoginPageProps) {
  const { authState, authDispatch } = useAuthContext()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null)

  /**
   * Validates that both fields are non-empty.
   * Sets per-field error messages and returns whether validation passed.
   */
  function validate(): boolean {
    let valid = true
    if (username.trim() === '') {
      setUsernameError('Benutzername darf nicht leer sein.')
      valid = false
    } else {
      setUsernameError(null)
    }
    if (password === '') {
      setPasswordError('Passwort darf nicht leer sein.')
      valid = false
    } else {
      setPasswordError(null)
    }
    return valid
  }

  /**
   * Handles form submission: validates, calls API, dispatches auth actions.
   */
  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setRateLimitMessage(null)

    if (!validate()) {
      return
    }

    authDispatch({ type: 'LOGIN_STARTED' })

    try {
      const result = await apiClient.login(username, password)
      apiClient.setToken(result.token)
      apiClient.setCsrfToken(result.csrfToken)
      authDispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          token: result.token,
          csrfToken: result.csrfToken,
          user: result.user,
        },
      })
    } catch (err: unknown) {
      if (isRateLimitError(err)) {
        const retryAfter = extractRetryAfter(err)
        setRateLimitMessage(
          `Zu viele Anmeldeversuche. Bitte warten Sie ${retryAfter} Sekunden.`,
        )
        authDispatch({
          type: 'LOGIN_FAILED',
          payload: { message: `Zu viele Anmeldeversuche. Bitte warten Sie ${retryAfter} Sekunden.` },
        })
      } else {
        authDispatch({
          type: 'LOGIN_FAILED',
          payload: { message: 'Anmeldung fehlgeschlagen. Bitte überprüfen Sie Ihre Zugangsdaten.' },
        })
      }
    }
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <h1 className="login-title">Slatebase</h1>

        <div className="login-field">
          <label className="login-label" htmlFor="login-username">
            Benutzername
          </label>
          <input
            id="login-username"
            className="login-input"
            type="text"
            maxLength={128}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              if (usernameError) setUsernameError(null)
            }}
            aria-invalid={usernameError !== null}
            aria-describedby={usernameError ? 'login-username-error' : undefined}
            autoComplete="username"
          />
          {usernameError && (
            <p id="login-username-error" className="login-field-error" role="alert">
              {usernameError}
            </p>
          )}
        </div>

        <div className="login-field">
          <label className="login-label" htmlFor="login-password">
            Passwort
          </label>
          <input
            id="login-password"
            className="login-input"
            type="password"
            maxLength={256}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (passwordError) setPasswordError(null)
            }}
            aria-invalid={passwordError !== null}
            aria-describedby={passwordError ? 'login-password-error' : undefined}
            autoComplete="current-password"
          />
          {passwordError && (
            <p id="login-password-error" className="login-field-error" role="alert">
              {passwordError}
            </p>
          )}
        </div>

        {rateLimitMessage && (
          <p className="login-error login-error--rate-limit" role="alert">
            {rateLimitMessage}
          </p>
        )}

        {authState.error && !rateLimitMessage && (
          <p className="login-error" role="alert">
            {authState.error}
          </p>
        )}

        <button
          type="submit"
          className="login-submit"
          disabled={authState.isLoading}
        >
          {authState.isLoading ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
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
    if (typeof retryAfter === 'number' && retryAfter > 0) {
      return retryAfter
    }
  }
  if (err !== null && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: string }).message
    const match = message.match(/(\d+)\s*(seconds?|Sekunden?)/)
    if (match?.[1]) {
      return parseInt(match[1], 10)
    }
  }
  return 900
}
