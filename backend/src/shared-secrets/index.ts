/**
 * shared-secrets module barrel export.
 * Encrypted at-rest credential storage shared by git-sync and mail-import.
 */

export type { IModuleSecretKeyManager } from './secret-key-manager.js'
export { ModuleSecretKeyManager } from './secret-key-manager.js'

export type { IModuleSecretStore } from './secret-store.js'
export { ModuleSecretStore, ModuleSecretTooLargeError } from './secret-store.js'
