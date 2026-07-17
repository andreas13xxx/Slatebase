import { useState } from 'react'
import { useTranslation } from '../../i18n'
import { useAppContext, loadVaults } from '../../state'
import { showToast } from '../ToastNotification'
import { extractErrorMessage } from '../../utils/error'
import type { IApiClient } from '../../api'

/** Props for the WelcomeVaultSection component. */
export interface WelcomeVaultSectionProps {
  /** API client instance for making welcome vault requests. */
  apiClient: IApiClient
}

/**
 * Section in the account settings that allows the user to create a welcome/tutorial vault.
 * Calls POST /api/v1/welcome-vault and shows success/error toast.
 * On success, refreshes the vault list so the new vault appears in the explorer.
 */
export function WelcomeVaultSection({ apiClient }: WelcomeVaultSectionProps) {
  const { t } = useTranslation()
  const { dispatch } = useAppContext()
  const [loading, setLoading] = useState(false)

  /** Handles the create welcome vault button click. */
  async function handleCreateWelcomeVault(): Promise<void> {
    setLoading(true)
    try {
      const result = await apiClient.createWelcomeVault()
      showToast('success', t('profile.welcomeVaultCreated', { name: result.vaultName }))
      // Refresh the vault list so the new vault appears in the explorer
      await loadVaults(dispatch, apiClient)
    } catch (err: unknown) {
      const message = extractErrorMessage(err, t('profile.welcomeVaultError'))
      // Check for feature-disabled (403) response
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'FEATURE_DISABLED'
      ) {
        showToast('error', t('profile.welcomeVaultFeatureDisabled'))
      } else {
        showToast('error', message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="profile-section" aria-labelledby="welcome-vault-section-heading">
      <h3 id="welcome-vault-section-heading" className="profile-section-title">
        {t('profile.createWelcomeVault')}
      </h3>
      <p className="welcome-vault-section__description">
        {t('profile.createWelcomeVaultDescription')}
      </p>
      <button
        type="button"
        className="profile-submit"
        onClick={handleCreateWelcomeVault}
        disabled={loading}
      >
        {loading ? t('profile.creatingWelcomeVault') : t('profile.createWelcomeVault')}
      </button>
    </section>
  )
}
