// Git-Sync Errors

export class GitSyncRemoteNotFoundError extends Error {
  public readonly code = 'GIT_SYNC_REMOTE_NOT_FOUND'

  constructor(vaultId: string, remoteId: string) {
    super(`Git-sync remote "${remoteId}" not found for vault "${vaultId}"`)
    this.name = 'GitSyncRemoteNotFoundError'
  }
}

export class GitSyncRemoteLimitExceededError extends Error {
  public readonly code = 'GIT_SYNC_REMOTE_LIMIT_EXCEEDED'

  constructor(vaultId: string, max: number) {
    super(`Vault "${vaultId}" has reached the maximum of ${max} git-sync remotes`)
    this.name = 'GitSyncRemoteLimitExceededError'
  }
}

/** Thrown when a `git` command exits non-zero for a reason other than a merge conflict. */
export class GitCommandFailedError extends Error {
  public readonly code = 'GIT_COMMAND_FAILED'

  constructor(
    public readonly args: readonly string[],
    public readonly stderr: string,
  ) {
    super(`git ${args.join(' ')} failed: ${stderr.slice(0, 2000)}`)
    this.name = 'GitCommandFailedError'
  }
}
