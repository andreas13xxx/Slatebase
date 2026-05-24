import { useState, type FormEvent } from 'react'
import { useAuthContext } from '../state/authContext'
import type { IApiClient } from '../api'

/** Props for the ChangePasswordPage component. */
export interface ChangePasswordPageProps {
  /** API client instance for making password change requests. */
  apiClient: IApiClient
}

/**
 * Change password page component shown when mustChangePassword is true.
 * Renders current password, new password, and confirm password fields with German labels.
 * Performs client-side validation before calling the API.
 */
export function ChangePasswordPage({ apiClient }: ChangePasswordPageProps) {
  const { authDispatch } = useAuthContext()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null)
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null)
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null)

  const [apiError, setApiError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  /**
   * Validates all fields client-side.
   * Sets per-field error messages and returns whether validation passed.
   */
  function validate(): boolean {
    let valid = true

    if (currentPassword === '') {
      setCurrentPasswordError('Aktuelles Passwort darf nicht leer sein.')
      valid = false
    } else {
      setCurrentPasswordError(null)
    }

    if (newPassword.length < 8) {
      setNewPasswordError('Neues Passwort muss mindestens 8 Zeichen lang sein.')
      valid = false
    } else if (newPassword === currentPassword) {
      setNewPasswordError('Neues Passwort muss sich vom aktuellen Passwort unterscheiden.')
      valid = false
    } else {
      setNewPasswordError(null)
    }

    if (confirmPassword !== newPassword) {
      setConfirmPasswordError('Passwörter stimmen nicht überein.')
      valid = false
    } else {
      setConfirmPasswordError(null)
    }

    return valid
  }

  /**
   * Handles form submission: validates, calls API, dispatches PASSWORD_CHANGED on success.
   */
  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setApiError(null)

    if (!validate()) {
      return
    }

    setIsPending(true)

    try {
      await apiClient.changePassword(currentPassword, newPassword)
      authDispatch({ type: 'PASSWORD_CHANGED' })
    } catch (err: unknown) {
      if (err !== null && typeof err === 'object' && 'message' in err) {
        setApiError((err as { message: string }).message)
      } else {
        setApiError('Passwortänderung fehlgeschlagen. Bitte versuchen Sie es erneut.')
      }
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        <h1 className="login-title">Passwort ändern</h1>
        <p className="change-password-info">
          Sie müssen Ihr Passwort ändern, bevor Sie fortfahren können.
        </p>

        <div className="login-field">
          <label className="login-label" htmlFor="change-current-password">
            Aktuelles Passwort
          </label>
          <input
            id="change-current-password"
            className="login-input"
            type="password"
            maxLength={128}
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value)
              if (currentPasswordError) setCurrentPasswordError(null)
            }}
            aria-invalid={currentPasswordError !== null}
            aria-describedby={currentPasswordError ? 'change-current-password-error' : undefined}
            autoComplete="current-password"
          />
          {currentPasswordError && (
            <p id="change-current-password-error" className="login-field-error" role="alert">
              {currentPasswordError}
            </p>
          )}
        </div>

        <div className="login-field">
          <label className="login-label" htmlFor="change-new-password">
            Neues Passwort
          </label>
          <input
            id="change-new-password"
            className="login-input"
            type="password"
            maxLength={128}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value)
              if (newPasswordError) setNewPasswordError(null)
            }}
            aria-invalid={newPasswordError !== null}
            aria-describedby={newPasswordError ? 'change-new-password-error' : undefined}
            autoComplete="new-password"
          />
          {newPasswordError && (
            <p id="change-new-password-error" className="login-field-error" role="alert">
              {newPasswordError}
            </p>
          )}
        </div>

        <div className="login-field">
          <label className="login-label" htmlFor="change-confirm-password">
            Passwort bestätigen
          </label>
          <input
            id="change-confirm-password"
            className="login-input"
            type="password"
            maxLength={128}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value)
              if (confirmPasswordError) setConfirmPasswordError(null)
            }}
            aria-invalid={confirmPasswordError !== null}
            aria-describedby={confirmPasswordError ? 'change-confirm-password-error' : undefined}
            autoComplete="new-password"
          />
          {confirmPasswordError && (
            <p id="change-confirm-password-error" className="login-field-error" role="alert">
              {confirmPasswordError}
            </p>
          )}
        </div>

        {apiError && (
          <p className="login-error" role="alert">
            {apiError}
          </p>
        )}

        <button
          type="submit"
          className="login-submit"
          disabled={isPending}
        >
          {isPending ? 'Passwort ändern…' : 'Passwort ändern'}
        </button>
      </form>
    </div>
  )
}
