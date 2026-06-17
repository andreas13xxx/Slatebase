import { useState, useEffect, type FormEvent } from 'react'
import { useAuthContext } from '../state/authContext'
import { useTranslation } from '../i18n'
import type { IApiClient, UpdateProfileData } from '../api'
import type { PublicUserInfo } from '../state/authState'

/** Props for the ProfilePage component. */
export interface ProfilePageProps {
  /** API client instance for making profile requests. */
  apiClient: IApiClient
  /** Rendering mode. 'profile-only' hides password and account deletion sections. */
  mode?: 'full' | 'profile-only'
}

/** Validation errors for profile fields. */
interface ProfileErrors {
  displayName: string | null
  email: string | null
  avatarUrl: string | null
  preferredLanguage: string | null
  colorScheme: string | null
}

/** Validation errors for password change fields. */
interface PasswordErrors {
  currentPassword: string | null
  newPassword: string | null
}

/** Initial empty profile errors. */
const emptyProfileErrors: ProfileErrors = {
  displayName: null,
  email: null,
  avatarUrl: null,
  preferredLanguage: null,
  colorScheme: null,
}

/** Initial empty password errors. */
const emptyPasswordErrors: PasswordErrors = {
  currentPassword: null,
  newPassword: null,
}

/**
 * RFC 5322 simplified email regex.
 * Validates basic email format: local@domain with at least one dot in domain.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validates a URL starts with http:// or https://.
 */
function isValidHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

/**
 * User profile page component for viewing and editing profile settings.
 * Includes sections for profile data, password change, and account deletion.
 * All labels are in German. Validates fields per design constraints before submit.
 */
export function ProfilePage({ apiClient, mode = 'full' }: ProfilePageProps) {
  const { authDispatch } = useAuthContext()
  const { t } = useTranslation()

  // --- Profile state ---
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState<'de' | 'en'>('de')
  const [colorScheme, setColorScheme] = useState<'light' | 'dark' | 'system'>('system')
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>(emptyProfileErrors)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [profileApiError, setProfileApiError] = useState<string | null>(null)
  const [profilePending, setProfilePending] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)

  // --- Password change state ---
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>(emptyPasswordErrors)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [passwordApiError, setPasswordApiError] = useState<string | null>(null)
  const [passwordPending, setPasswordPending] = useState(false)

  // --- Account deletion state ---
  const [deletePassword, setDeletePassword] = useState('')
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null)
  const [deleteApiError, setDeleteApiError] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  /**
   * Loads the user profile on mount.
   */
  useEffect(() => {
    let cancelled = false

    async function loadProfile(): Promise<void> {
      try {
        const profile: PublicUserInfo = await apiClient.getProfile()
        if (cancelled) return
        setDisplayName(profile.displayName ?? '')
        setEmail(profile.email ?? '')
        setAvatarUrl(profile.avatarUrl ?? '')
        setPreferredLanguage(profile.preferredLanguage ?? 'de')
        setColorScheme(profile.colorScheme ?? 'system')
      } catch (err: unknown) {
        if (cancelled) return
        if (err !== null && typeof err === 'object' && 'message' in err) {
          setProfileApiError((err as { message: string }).message)
        } else {
          setProfileApiError(t('profile.profileLoadError'))
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [apiClient])

  /**
   * Validates profile fields per design constraints.
   * Returns true if all fields are valid.
   */
  function validateProfile(): boolean {
    const errors: ProfileErrors = { ...emptyProfileErrors }
    let valid = true

    // Display name: 1-50 chars
    if (displayName.length < 1) {
      errors.displayName = t('profile.displayNameRequired')
      valid = false
    } else if (displayName.length > 50) {
      errors.displayName = t('profile.displayNameTooLong')
      valid = false
    }

    // Email: RFC 5322, max 254 chars (empty is allowed)
    if (email !== '') {
      if (email.length > 254) {
        errors.email = t('profile.emailTooLong')
        valid = false
      } else if (!EMAIL_REGEX.test(email)) {
        errors.email = t('profile.emailInvalid')
        valid = false
      }
    }

    // Avatar URL: max 2048 chars, must start with http:// or https:// (empty is allowed)
    if (avatarUrl !== '') {
      if (avatarUrl.length > 2048) {
        errors.avatarUrl = t('profile.avatarUrlTooLong')
        valid = false
      } else if (!isValidHttpUrl(avatarUrl)) {
        errors.avatarUrl = t('profile.avatarUrlInvalid')
        valid = false
      }
    }

    // Preferred language: must be 'de' or 'en'
    if (preferredLanguage !== 'de' && preferredLanguage !== 'en') {
      errors.preferredLanguage = t('profile.invalidLanguage')
      valid = false
    }

    // Color scheme: must be 'light', 'dark', or 'system'
    if (colorScheme !== 'light' && colorScheme !== 'dark' && colorScheme !== 'system') {
      errors.colorScheme = t('profile.invalidColorScheme')
      valid = false
    }

    setProfileErrors(errors)
    return valid
  }

  /**
   * Handles profile form submission.
   */
  async function handleProfileSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setProfileSuccess(null)
    setProfileApiError(null)

    if (!validateProfile()) {
      return
    }

    setProfilePending(true)

    try {
      const data: UpdateProfileData = {
        displayName,
        email,
        avatarUrl,
        preferredLanguage,
        colorScheme,
      }
      const updatedUser = await apiClient.updateProfile(data)
      authDispatch({ type: 'PROFILE_UPDATED', payload: { user: updatedUser } })
      setProfileSuccess(t('profile.profileSaved'))
    } catch (err: unknown) {
      if (err !== null && typeof err === 'object' && 'message' in err) {
        setProfileApiError((err as { message: string }).message)
      } else {
        setProfileApiError(t('profile.profileSaveError'))
      }
    } finally {
      setProfilePending(false)
    }
  }

  /**
   * Validates password change fields.
   * Returns true if all fields are valid.
   */
  function validatePassword(): boolean {
    const errors: PasswordErrors = { ...emptyPasswordErrors }
    let valid = true

    if (currentPassword === '') {
      errors.currentPassword = t('auth.currentPasswordRequired')
      valid = false
    }

    if (newPassword.length < 8) {
      errors.newPassword = t('auth.newPasswordTooShort')
      valid = false
    }

    setPasswordErrors(errors)
    return valid
  }

  /**
   * Handles password change form submission.
   */
  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setPasswordSuccess(null)
    setPasswordApiError(null)

    if (!validatePassword()) {
      return
    }

    setPasswordPending(true)

    try {
      await apiClient.changePassword(currentPassword, newPassword)
      setPasswordSuccess(t('auth.passwordChanged'))
      setCurrentPassword('')
      setNewPassword('')
    } catch (err: unknown) {
      if (err !== null && typeof err === 'object' && 'message' in err) {
        setPasswordApiError((err as { message: string }).message)
      } else {
        setPasswordApiError(t('profile.passwordChangeError'))
      }
    } finally {
      setPasswordPending(false)
    }
  }

  /**
   * Handles account deletion form submission.
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

  if (profileLoading) {
    return (
      <div className="profile-page" aria-busy="true">
        <p>{t('profile.profileLoading')}</p>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <h1 className="profile-title">{t('profile.title')}</h1>

      {/* --- Profile Section --- */}
      <section className="profile-section" aria-labelledby="profile-section-heading">
        <h2 id="profile-section-heading" className="profile-section-title">{t('profile.sectionProfile')}</h2>
        <form className="profile-form" onSubmit={handleProfileSubmit} noValidate>
          <div className="profile-field">
            <label className="profile-label" htmlFor="profile-display-name">
              {t('profile.displayName')}
            </label>
            <input
              id="profile-display-name"
              className="profile-input"
              type="text"
              maxLength={50}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                if (profileErrors.displayName) setProfileErrors((prev) => ({ ...prev, displayName: null }))
              }}
              aria-invalid={profileErrors.displayName !== null}
              aria-describedby={profileErrors.displayName ? 'profile-display-name-error' : undefined}
            />
            {profileErrors.displayName && (
              <p id="profile-display-name-error" className="profile-field-error" role="alert">
                {profileErrors.displayName}
              </p>
            )}
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="profile-email">
              {t('profile.email')}
            </label>
            <input
              id="profile-email"
              className="profile-input"
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (profileErrors.email) setProfileErrors((prev) => ({ ...prev, email: null }))
              }}
              aria-invalid={profileErrors.email !== null}
              aria-describedby={profileErrors.email ? 'profile-email-error' : undefined}
            />
            {profileErrors.email && (
              <p id="profile-email-error" className="profile-field-error" role="alert">
                {profileErrors.email}
              </p>
            )}
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="profile-avatar-url">
              {t('profile.avatarUrl')}
            </label>
            <input
              id="profile-avatar-url"
              className="profile-input"
              type="url"
              maxLength={2048}
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value)
                if (profileErrors.avatarUrl) setProfileErrors((prev) => ({ ...prev, avatarUrl: null }))
              }}
              aria-invalid={profileErrors.avatarUrl !== null}
              aria-describedby={profileErrors.avatarUrl ? 'profile-avatar-url-error' : undefined}
              placeholder="https://example.com/avatar.png"
            />
            {profileErrors.avatarUrl && (
              <p id="profile-avatar-url-error" className="profile-field-error" role="alert">
                {profileErrors.avatarUrl}
              </p>
            )}
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="profile-language">
              {t('profile.preferredLanguage')}
            </label>
            <select
              id="profile-language"
              className="profile-select"
              value={preferredLanguage}
              onChange={(e) => {
                setPreferredLanguage(e.target.value as 'de' | 'en')
                if (profileErrors.preferredLanguage) setProfileErrors((prev) => ({ ...prev, preferredLanguage: null }))
              }}
              aria-invalid={profileErrors.preferredLanguage !== null}
              aria-describedby={profileErrors.preferredLanguage ? 'profile-language-error' : undefined}
            >
              <option value="de">{t('profile.languageDe')}</option>
              <option value="en">{t('profile.languageEn')}</option>
            </select>
            {profileErrors.preferredLanguage && (
              <p id="profile-language-error" className="profile-field-error" role="alert">
                {profileErrors.preferredLanguage}
              </p>
            )}
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="profile-color-scheme">
              {t('profile.colorScheme')}
            </label>
            <select
              id="profile-color-scheme"
              className="profile-select"
              value={colorScheme}
              onChange={(e) => {
                setColorScheme(e.target.value as 'light' | 'dark' | 'system')
                if (profileErrors.colorScheme) setProfileErrors((prev) => ({ ...prev, colorScheme: null }))
              }}
              aria-invalid={profileErrors.colorScheme !== null}
              aria-describedby={profileErrors.colorScheme ? 'profile-color-scheme-error' : undefined}
            >
              <option value="light">{t('profile.colorSchemeLight')}</option>
              <option value="dark">{t('profile.colorSchemeDark')}</option>
              <option value="system">{t('profile.colorSchemeSystem')}</option>
            </select>
            {profileErrors.colorScheme && (
              <p id="profile-color-scheme-error" className="profile-field-error" role="alert">
                {profileErrors.colorScheme}
              </p>
            )}
          </div>

          {profileApiError && (
            <p className="profile-error" role="alert">
              {profileApiError}
            </p>
          )}

          {profileSuccess && (
            <p className="profile-success" role="status">
              {profileSuccess}
            </p>
          )}

          <button
            type="submit"
            className="profile-submit"
            disabled={profilePending}
          >
            {profilePending ? t('profile.savingProfile') : t('profile.saveProfile')}
          </button>
        </form>
      </section>

      {/* --- Password Change Section --- */}
      {mode === 'full' && (
      <section className="profile-section" aria-labelledby="password-section-heading">
        <h2 id="password-section-heading" className="profile-section-title">{t('profile.sectionPassword')}</h2>
        <form className="profile-form" onSubmit={handlePasswordSubmit} noValidate>
          <div className="profile-field">
            <label className="profile-label" htmlFor="profile-current-password">
              {t('auth.currentPassword')}
            </label>
            <input
              id="profile-current-password"
              className="profile-input"
              type="password"
              maxLength={128}
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value)
                if (passwordErrors.currentPassword) setPasswordErrors((prev) => ({ ...prev, currentPassword: null }))
              }}
              aria-invalid={passwordErrors.currentPassword !== null}
              aria-describedby={passwordErrors.currentPassword ? 'profile-current-password-error' : undefined}
              autoComplete="current-password"
            />
            {passwordErrors.currentPassword && (
              <p id="profile-current-password-error" className="profile-field-error" role="alert">
                {passwordErrors.currentPassword}
              </p>
            )}
          </div>

          <div className="profile-field">
            <label className="profile-label" htmlFor="profile-new-password">
              {t('auth.newPassword')}
            </label>
            <input
              id="profile-new-password"
              className="profile-input"
              type="password"
              maxLength={128}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value)
                if (passwordErrors.newPassword) setPasswordErrors((prev) => ({ ...prev, newPassword: null }))
              }}
              aria-invalid={passwordErrors.newPassword !== null}
              aria-describedby={passwordErrors.newPassword ? 'profile-new-password-error' : undefined}
              autoComplete="new-password"
            />
            {passwordErrors.newPassword && (
              <p id="profile-new-password-error" className="profile-field-error" role="alert">
                {passwordErrors.newPassword}
              </p>
            )}
          </div>

          {passwordApiError && (
            <p className="profile-error" role="alert">
              {passwordApiError}
            </p>
          )}

          {passwordSuccess && (
            <p className="profile-success" role="status">
              {passwordSuccess}
            </p>
          )}

          <button
            type="submit"
            className="profile-submit"
            disabled={passwordPending}
          >
            {passwordPending ? t('auth.changingPassword') : t('auth.changePassword')}
          </button>
        </form>
      </section>
      )}

      {/* --- Account Deletion Section --- */}
      {mode === 'full' && (
      <section className="profile-section profile-section--danger" aria-labelledby="delete-section-heading">
        <h2 id="delete-section-heading" className="profile-section-title">{t('profile.sectionDelete')}</h2>
        <p className="profile-danger-info">
          {t('profile.deleteWarning')}
        </p>
        <form className="profile-form" onSubmit={handleDeleteSubmit} noValidate>
          <div className="profile-field">
            <label className="profile-label" htmlFor="profile-delete-password">
              {t('profile.deletePasswordLabel')}
            </label>
            <input
              id="profile-delete-password"
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
              aria-describedby={deletePasswordError ? 'profile-delete-password-error' : undefined}
              autoComplete="current-password"
            />
            {deletePasswordError && (
              <p id="profile-delete-password-error" className="profile-field-error" role="alert">
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
      )}
    </div>
  )
}
