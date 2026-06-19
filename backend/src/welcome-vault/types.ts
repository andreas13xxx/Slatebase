/**
 * Welcome Vault type definitions.
 *
 * Configuration and callback types for the welcome vault feature
 * that creates pre-populated vaults for new users.
 */

/** Configuration for the welcome vault feature */
export interface WelcomeVaultConfig {
  /** Vault name per language */
  name: {
    de: string
    en: string
  }
}

/** Supported languages for welcome vault templates */
export type WelcomeVaultLanguage = 'de' | 'en'

/**
 * Callback invoked after a new user account is successfully created.
 * Used to trigger side effects like welcome vault creation.
 * Implementations MUST NOT throw — errors should be handled internally.
 *
 * @param userId - The newly created user's ID
 * @param language - The preferred language for the welcome vault content
 */
export type OnUserCreatedFn = (userId: string, language: WelcomeVaultLanguage) => Promise<void>
