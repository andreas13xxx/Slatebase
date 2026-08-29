// Git-Sync module barrel export

export type { GitAuthMethod, GitSyncResult, GitSyncRemoteConfig, GitSyncVaultData, GitSyncRemoteStatus, GitSyncStatusMap, GitAuthContext } from './types.js'

export { GitSyncRemoteNotFoundError, GitSyncRemoteLimitExceededError, GitCommandFailedError } from './errors.js'

export {
  createGitSyncRemoteSchema,
  updateGitSyncRemoteSchema,
  updateGitSyncBranchSchema,
  gitSyncVaultIdParamSchema,
  gitSyncRemoteIdParamSchema,
  isValidGitSyncRemoteId,
  isValidGitBranchName,
} from './validation.js'
export type { CreateGitSyncRemoteInput, UpdateGitSyncRemoteInput } from './validation.js'

export { GitSyncConfigStore, DEFAULT_GIT_SYNC_BRANCH, MAX_REMOTES_PER_VAULT } from './config-store.js'
export type { IGitSyncConfigStore } from './config-store.js'

export { GitSyncStatusStore } from './status-store.js'
export type { IGitSyncStatusStore } from './status-store.js'

export { GitCli } from './git-cli.js'
export type { IGitCli } from './git-cli.js'

export { SshKeyGenerator } from './ssh-keygen.js'
export type { ISshKeyGenerator } from './ssh-keygen.js'

export { GitSyncEngine, gitRemoteNameFor, GIT_SYNC_SECRET_MODULE_ID } from './sync-engine.js'
export type { IGitSyncEngine, GitSyncRunOutcome } from './sync-engine.js'

export { GitSyncScheduler } from './git-sync-scheduler.js'
