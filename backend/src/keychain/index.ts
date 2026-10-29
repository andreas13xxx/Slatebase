/**
 * keychain module barrel export.
 * Vault-scoped named secrets shared by all plugins of a vault.
 */

export type { IKeychainService } from './keychain-service.js'
export {
  KeychainService,
  KeychainInvalidIdError,
  KeychainLimitExceededError,
  KEYCHAIN_MODULE_ID,
  KEYCHAIN_SECRET_ID_PATTERN,
  KEYCHAIN_SECRET_ID_MAX_LENGTH,
  MAX_KEYCHAIN_ENTRIES,
  isValidKeychainSecretId,
} from './keychain-service.js'
