/**
 * shared-secrets module barrel export.
 * Encrypted at-rest credential storage shared by git-sync and mail-import.
 */

export type { IModuleSecretKeyManager } from './secret-key-manager.js'
export { ModuleSecretKeyManager, SecretKeyError } from './secret-key-manager.js'

export type { IModuleSecretStore, IListableModuleSecretStore } from './secret-store.js'
export { ModuleSecretStore, ModuleSecretTooLargeError, ModuleSecretLimitError } from './secret-store.js'
