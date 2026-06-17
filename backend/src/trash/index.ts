// Barrel export for trash module

export type { ITrashService, TrashEntry, TrashIndex } from './types.js'
export { TrashService, type VaultPathResolver } from './trash-service.js'
export { TrashNotFoundError, TrashRestoreError } from './errors.js'
