// GitSyncEngine — runs one fetch/merge/push cycle for one vault's git remote.
//
// On a merge conflict, the working tree is deliberately left with conflict
// markers (no `git merge --abort`) — Slatebase's own markdown editor can
// already open and edit the conflicted file directly, so the user resolves
// it the same way they'd resolve any git conflict, and the next scheduled
// run picks up where they left off once they commit the resolution.

import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { KeyedMutex } from '../shared/async-mutex.js'
import { isNodeError } from '../shared/fs-utils.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IGitSyncConfigStore } from './config-store.js'
import type { IGitSyncStatusStore } from './status-store.js'
import type { IGitCli } from './git-cli.js'
import type { IModuleSecretStore } from '../shared-secrets/index.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IEventBus } from '../realtime/types.js'
import type { GitAuthContext, GitSyncResult } from './types.js'
import { GitSyncRemoteNotFoundError } from './errors.js'

export const GIT_SYNC_SECRET_MODULE_ID = 'git-sync'
const REQUIRED_GITIGNORE_LINES = ['.slatebase/', '.obsidian/']
/** Synthetic actor identity used for realtime events published by the background sync job (no browser session is involved). */
const GIT_SYNC_ACTOR = { userId: 'system:git-sync', username: 'Git-Sync' }

export interface GitSyncRunOutcome {
  result: GitSyncResult
  error?: string
  conflictFiles?: string[]
  /** Files brought in by the merge (only set on a `success` result that actually merged something). */
  pulledFiles?: number
  /** Files committed locally and pushed (only set on a `success` result). */
  pushedFiles?: number
}

/** Conflict markers as git writes them into the working tree — `<<<<<<<`/`>>>>>>>` at the start of a line. */
function hasConflictMarkers(content: string): boolean {
  return content.split('\n').some((line) => line.startsWith('<<<<<<< ') || line.startsWith('>>>>>>> '))
}

/** Internal git remote name, derived from the config id — never the user-facing free-text `name`. */
export function gitRemoteNameFor(remoteId: string): string {
  return `slatebase-${remoteId}`
}

export interface IGitSyncEngine {
  runOne(vaultId: string, remoteId: string): Promise<GitSyncRunOutcome>
}

export class GitSyncEngine implements IGitSyncEngine {
  private readonly locks = new KeyedMutex()

  constructor(
    private readonly gitCli: IGitCli,
    private readonly vaultRegistry: IVaultRegistry,
    private readonly configStore: IGitSyncConfigStore,
    private readonly statusStore: IGitSyncStatusStore,
    private readonly secretStore: IModuleSecretStore,
    private readonly dataDir: string,
    private readonly logger: ILogger,
    private readonly eventBus?: IEventBus,
    private readonly accessControl?: IVaultAccessControl,
  ) {}

  /**
   * Runs one sync cycle for `remoteId`. Serialized per vault (via a
   * per-vaultId mutex) since every remote of a vault shares the same
   * working directory/branch — two remotes syncing concurrently would
   * race on the same git commands.
   */
  async runOne(vaultId: string, remoteId: string): Promise<GitSyncRunOutcome> {
    return this.locks.runExclusive(vaultId, () => this.runOneUnlocked(vaultId, remoteId))
  }

  private async runOneUnlocked(vaultId: string, remoteId: string): Promise<GitSyncRunOutcome> {
    const vaultEntry = this.vaultRegistry.findById(vaultId)
    if (!vaultEntry) {
      throw new GitSyncRemoteNotFoundError(vaultId, remoteId)
    }

    const remote = await this.configStore.getRemote(vaultId, remoteId)
    if (!remote) {
      throw new GitSyncRemoteNotFoundError(vaultId, remoteId)
    }

    const vaultData = await this.configStore.getVaultData(vaultId)
    const cwd = vaultEntry.storagePath
    const remoteName = gitRemoteNameFor(remoteId)

    try {
      // A previous run may have left the working tree mid-merge with conflict
      // markers. If those markers are still there, the user hasn't actually
      // resolved anything yet — proceeding would have `commitAll()` stage and
      // commit the raw `<<<<<<<`/`>>>>>>>` markers as if they were real content
      // and push that. Bail out again (same conflict, nothing attempted) until
      // the file is genuinely clean.
      const isRepo = await this.gitCli.isRepo(cwd)
      if (isRepo) {
        const priorConflicts = await this.gitCli.conflictedFiles(cwd)
        if (priorConflicts.length > 0) {
          const stillConflicted = await this.filesWithConflictMarkers(cwd, priorConflicts)
          if (stillConflicted.length > 0) {
            this.logger.info('Git-sync: previous conflict not yet resolved in the working tree, skipping run', {
              vaultId, remoteId, conflictFiles: stillConflicted,
            })
            return this.finish(vaultId, remoteId, { result: 'conflict', conflictFiles: stillConflicted })
          }
          // All previously-conflicted files are clean now — commitAll() below
          // will stage the resolution and conclude the in-progress merge.
        }
      }

      const credential = await this.secretStore.getSecret(vaultId, GIT_SYNC_SECRET_MODULE_ID, remoteId)
      if (credential === null) {
        return this.finish(vaultId, remoteId, { result: 'error', error: 'No credential stored for this remote' })
      }
      const auth: GitAuthContext = remote.authMethod === 'https-token'
        ? { method: 'https-token', token: credential }
        : { method: 'ssh-key', privateKey: credential, knownHostsPath: this.knownHostsPathFor(remoteId) }

      if (!isRepo) {
        await this.gitCli.init(cwd, vaultData.branch)
      }
      await this.gitCli.configureIdentity(cwd)
      await this.ensureGitignore(cwd)
      await this.gitCli.remoteAddOrSetUrl(cwd, remoteName, remote.remoteUrl)

      // Commit any local changes (including the .gitignore we may have just written) first.
      const preCommitHead = await this.gitCli.getHead(cwd)
      await this.gitCli.commitAll(cwd, 'Slatebase sync: local changes')
      const postCommitHead = await this.gitCli.getHead(cwd)
      const pushedFiles = postCommitHead && postCommitHead !== preCommitHead
        ? (await this.gitCli.diffNameOnly(cwd, preCommitHead, postCommitHead)).length
        : 0

      let fetched = true
      try {
        await this.gitCli.fetch(cwd, remoteName, vaultData.branch, auth)
      } catch (error) {
        fetched = false
        this.logger.warn('Git-sync fetch failed, assuming empty/new remote and proceeding to push', {
          vaultId, remoteId, message: error instanceof Error ? error.message : String(error),
        })
      }

      let pulledFiles = 0
      if (fetched) {
        const preMergeHead = postCommitHead
        const mergeResult = await this.gitCli.mergeNoEdit(cwd, remoteName, vaultData.branch)
        if (mergeResult === 'conflict') {
          const conflictFiles = await this.gitCli.conflictedFiles(cwd)
          this.logger.warn('Git-sync merge conflict, leaving conflict markers for manual resolution', {
            vaultId, remoteId, conflictFiles,
          })
          return this.finish(vaultId, remoteId, { result: 'conflict', conflictFiles })
        }
        // Notify open sessions their file tree may be stale — but only when the
        // merge actually brought in remote changes, not on every no-op poll.
        if (mergeResult === 'merged') {
          const postMergeHead = await this.gitCli.getHead(cwd)
          if (postMergeHead) {
            pulledFiles = (await this.gitCli.diffNameOnly(cwd, preMergeHead, postMergeHead)).length
          }
          await this.publishVaultChange(vaultId)
        }
      }

      // A vault with nothing committable yet (e.g. brand new/empty) never
      // creates a first commit, so `refs/heads/<branch>` doesn't exist —
      // pushing it would fail with "src refspec ... does not match any".
      if (!(await this.gitCli.hasCommits(cwd))) {
        this.logger.info('Git-sync: nothing to push yet (no commits in repo)', { vaultId, remoteId })
        return this.finish(vaultId, remoteId, { result: 'success', pulledFiles: 0, pushedFiles: 0 })
      }

      await this.gitCli.push(cwd, remoteName, vaultData.branch, auth)

      this.logger.info('Git-sync run succeeded', { vaultId, remoteId, pulledFiles, pushedFiles })
      return this.finish(vaultId, remoteId, { result: 'success', pulledFiles, pushedFiles })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Git-sync run failed', { vaultId, remoteId, message })
      return this.finish(vaultId, remoteId, { result: 'error', error: message })
    }
  }

  private async finish(vaultId: string, remoteId: string, outcome: GitSyncRunOutcome): Promise<GitSyncRunOutcome> {
    await this.statusStore.setStatus(vaultId, {
      remoteId,
      lastRunAt: new Date().toISOString(),
      lastResult: outcome.result,
      lastError: outcome.error ?? null,
      conflictFiles: outcome.conflictFiles ?? [],
      lastPulledFiles: outcome.pulledFiles ?? null,
      lastPushedFiles: outcome.pushedFiles ?? null,
    })
    return outcome
  }

  /** Of the given (previously conflicted) files, returns those that still contain conflict markers on disk. A file that no longer exists is treated as resolved (e.g. resolved by deleting it). */
  private async filesWithConflictMarkers(cwd: string, files: string[]): Promise<string[]> {
    const stillConflicted: string[] = []
    for (const file of files) {
      try {
        const content = await readFile(join(cwd, file), 'utf-8')
        if (hasConflictMarkers(content)) {
          stillConflicted.push(file)
        }
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'ENOENT') throw error
      }
    }
    return stillConflicted
  }

  /**
   * Publishes a vault:change event so open sessions refresh their file tree.
   * Unlike API-triggered changes, there's no browser session to exclude —
   * every user with access to the vault should be notified. The changed path
   * is the vault root since a merge can touch an arbitrary set of files.
   */
  private async publishVaultChange(vaultId: string): Promise<void> {
    if (!this.eventBus) return

    const target = this.accessControl
      ? { kind: 'users' as const, userIds: await this.accessControl.getUsersWithAccess(vaultId) }
      : { kind: 'broadcast' as const }

    this.eventBus.publish({
      type: 'vault:change',
      payload: { vaultId, action: 'saved', path: '/', ...GIT_SYNC_ACTOR },
      target,
    })
  }

  private knownHostsPathFor(remoteId: string): string {
    return join(this.dataDir, 'git-sync', 'known-hosts', `${remoteId}.txt`)
  }

  private async ensureGitignore(cwd: string): Promise<void> {
    const gitignorePath = join(cwd, '.gitignore')
    let existingLines: string[] = []
    try {
      existingLines = (await readFile(gitignorePath, 'utf-8')).split('\n')
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') throw error
    }

    const missing = REQUIRED_GITIGNORE_LINES.filter((line) => !existingLines.includes(line))
    if (missing.length === 0) return

    await mkdir(cwd, { recursive: true })
    const content = [...existingLines.filter((l) => l.length > 0), ...missing].join('\n') + '\n'
    await writeFile(gitignorePath, content, 'utf-8')
  }
}
