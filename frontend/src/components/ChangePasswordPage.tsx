import { useState, type FormEvent } from 'react'
import { useAuthContext } from '../state/authContext'
import { useTranslation } from '../i18n'
import type { IApiClient } from '../api'

/** Props for the ChangePasswordPage component. */
export interface ChangePasswordPageProps {
  /** API client instance for making password change requests. */
  apiClient: IApiClient
  /** When true, uses profile-style classes instead of login-page wrapper (for settings panel embedding). */
  embedded?: boolean
}

/**
 * Change password page component shown when mustChangePassword is true.
 * Renders current password, new password, and confirm password fields.
 * Performs client-side validation before calling the API.
 */
export function ChangePasswordPage({ apiClient, embedded }: ChangePasswordPageProps) {
  const { authDispatch } = useAuthContext()
  const { t } = useTranslation()

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
      setCurrentPasswordError(t('auth.currentPasswordRequired'))
      valid = false
    } else {
      setCurrentPasswordError(null)
    }

    if (newPassword.length < 8) {
      setNewPasswordError(t('auth.newPasswordTooShort'))
      valid = false
    } else if (newPassword === currentPassword) {
      setNewPasswordError(t('auth.newPasswordSameAsCurrent'))
      valid = false
    } else {
      setNewPasswordError(null)
    }

    if (confirmPassword !== newPassword) {
      setConfirmPasswordError(t('auth.passwordsDoNotMatch'))
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
        setApiError(t('auth.changePasswordFailed'))
      }
    } finally {
      setIsPending(false)
    }
  }

  const formClass = embedded ? 'profile-form' : 'login-form'
  const fieldClass = embedded ? 'profile-field' : 'login-field'
  const labelClass = embedded ? 'profile-label' : 'login-label'
  const inputClass = embedded ? 'profile-input' : 'login-input'

  const formContent = (
    <form className={formClass} onSubmit={handleSubmit} noValidate>
      {!embedded && <h1 className="login-title">{t('auth.changePassword')}</h1>}
      <p className="change-password-info">
        {t('auth.changePasswordInfo')}
      </p>

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="change-current-password">
          {t('auth.currentPassword')}
        </label>
        <input
          id="change-current-password"
          className={inputClass}
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

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="change-new-password">
          {t('auth.newPassword')}
        </label>
        <input
          id="change-new-password"
          className={inputClass}
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

      <div className={fieldClass}>
        <label className={labelClass} htmlFor="change-confirm-password">
          {t('auth.confirmPassword')}
        </label>
        <input
          id="change-confirm-password"
          className={inputClass}
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
        {isPending ? t('auth.changingPassword') : t('auth.changePassword')}
      </button>
    </form>
  )

  if (embedded) {
    return formContent
  }

  return (
    <div className="login-page">
      {formContent}
    </div>
  )
}
