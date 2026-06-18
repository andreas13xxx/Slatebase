import { useState, type FormEvent } from 'react'
import { useAuthContext } from '../../state/authContext'
import { useTranslation } from '../../i18n'
import type { IApiClient } from '../../api'

/** Props for the AccountDeletionSection component. */
export interface AccountDeletionSectionProps {
  /** API client instance for making account deletion requests. */
  apiClient: IApiClient
}

/**
 * Self-contained account deletion section with password confirmation and
 * two-step confirmation flow. Dispatches LOGOUT on successful deletion.
 *
 * Extracted from ProfilePage for use in the unified Settings panel.
 * Renders no outer layout wrapper — intended to be placed inside SettingsContent.
 */
export function AccountDeletionSection({ apiClient }: AccountDeletionSectionProps) {
  const { authDispatch } = useAuthContext()
  const { t } = useTranslation()

  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null)
  const [deleteApiError, setDeleteApiError] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  /**
   * Handles account deletion form submission.
   * First submission with valid password transitions to confirmation state.
   * Second submission executes the deletion.
   */
  async function handleDeleteSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setDeleteApiError(null)
    setDeletePasswordError(null)

    if (deletePassword === '') {
      setDeletePasswordError(t('profile.deletePasswordRequired'))
      return
    }

    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }

    setDeletePending(true)

    try {
      await apiClient.deleteSelf(deletePassword)
      authDispatch({ type: 'LOGOUT' })
    } catch (err: unknown) {
      if (err !== null && typeof err === 'object' && 'message' in err) {
        setDeleteApiError((err as { message: string }).message)
      } else {
        setDeleteApiError(t('profile.deleteAccountFailed'))
      }
      setDeleteConfirm(false)
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <section className="profile-section profile-section--danger" aria-labelledby="delete-section-heading">
      <h2 id="delete-section-heading" className="profile-section-title" tabIndex={-1}>
        {t('profile.sectionDelete')}
      </h2>
      <p className="profile-danger-info">
        {t('profile.deleteWarning')}
      </p>
      <form className="profile-form" onSubmit={handleDeleteSubmit} noValidate>
        <div className="profile-field">
          <label className="profile-label" htmlFor="settings-delete-password">
            {t('profile.deletePasswordLabel')}
          </label>
          <input
            id="settings-delete-password"
            className="profile-input"
            type="password"
            maxLength={128}
            value={deletePassword}
            onChange={(e) => {
              setDeletePassword(e.target.value)
              if (deletePasswordError) setDeletePasswordError(null)
              if (deleteConfirm) setDeleteConfirm(false)
            }}
            aria-invalid={deletePasswordError !== null}
            aria-describedby={deletePasswordError ? 'settings-delete-password-error' : undefined}
            autoComplete="current-password"
          />
          {deletePasswordError && (
            <p id="settings-delete-password-error" className="profile-field-error" role="alert">
              {deletePasswordError}
            </p>
          )}
        </div>

        {deleteApiError && (
          <p className="profile-error" role="alert">
            {deleteApiError}
          </p>
        )}

        <button
          type="submit"
          className="profile-submit profile-submit--danger"
          disabled={deletePending}
          aria-label={deleteConfirm ? t('profile.deleteAccountAriaConfirm') : t('profile.deleteAccount')}
        >
          {deletePending
            ? t('profile.deletingAccount')
            : deleteConfirm
              ? t('profile.deleteAccountConfirm')
              : t('profile.deleteAccount')}
        </button>
      </form>
    </section>
  )
}
