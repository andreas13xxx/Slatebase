/**
 * Welcome Vault type definitions.
 *
 * Configuration and callback types for the welcome vault feature
 * that creates pre-populated vaults for new users.
 */

/** Configuration for the welcome vault feature */
export interface WelcomeVaultConfig {
  /** Vault name for the welcome vault (default: "Willkommen") */
  name: string
}

/**
 * Callback invoked after a new user account is successfully created.
 * Used to trigger side effects like welcome vault creation.
 * Implementations MUST NOT throw — errors should be handled internally.
 */
export type OnUserCreatedFn = (userId: string) => Promise<void>
