// SyncSideEffects — gives a git merge the side effects a normal write has.
//
// A pull changes files straight on disk, bypassing trash, file versions, the
// activity timeline and the link index. The previous content is still in git,
// so after the merge we read it back with `git show <preMergeHead>:<path>`.

import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { ILogger } from '../logger/index.js'
import type { ITrashService } from '../trash/types.js'
import type { IVersionService } from '../version/types.js'
import type { ActivityEventInput, ActivityEventType } from '../activity/types.js'
import type { GitFileChange, IGitCli } from './git-cli.js'

/** Above this many touched files only the summary event is recorded, not one event per file. */
export const MAX_PER_FILE_ACTIVITY = 500

/** Files above this size get no version (the trash copy is still made). Matches the editor's limit. */
const MAX_VERSION_BYTES = 5 * 1024 * 1024

/** Files above this size are not read back into the link index. */
const MAX_INDEX_BYTES = 5 * 1024 * 1024

const ACTOR_NAME = 'Git-Sync'

/** Link-index calls the side effects need; shaped like the REST/MCP `linkIndexHook`. */
export interface SyncLinkIndexHook {
  onFileSaved(vaultId: string, filePath: string, content: string): void
  onFileDeleted(vaultId: string, filePath: string): void | Promise<void>
  onFileRenamed(vaultId: string, oldPath: string, newPath: string): void | Promise<void>
}

export interface SyncSideEffectsDeps {
  gitCli: IGitCli
  trashService: Pick<ITrashService, 'addFromContent'>
  versionService: Pick<IVersionService, 'createVersion' | 'moveVersions'>
  logger: ILogger
  /** Present only when the `activity-timeline` feature is on. Fire-and-forget. */
  recordActivity?: (vaultId: string, event: ActivityEventInput) => void
  linkIndexHook?: SyncLinkIndexHook
}

export interface SyncSideEffectsResult {
  trashed: number
  versioned: number
  moved: number
  /** Whether one activity event per file was recorded (false above {@link MAX_PER_FILE_ACTIVITY}). */
  perFileActivity: boolean
}

/** Hidden = any path segment starting with a dot (`.obsidian/`, `.gitignore`), like the vault tree. */
function isHiddenPath(path: string): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'))
}

function eventTypeFor(status: 'A' | 'M' | 'D', path: string): ActivityEventType {
  const prefix = extname(path) === '.canvas' ? 'canvas' : extname(path) === '.base' ? 'base' : 'note'
  const suffix = status === 'A' ? 'created' : status === 'M' ? 'edited' : 'deleted'
  return `${prefix}.${suffix}` as ActivityEventType
}

export class SyncSideEffects {
  constructor(private readonly deps: SyncSideEffectsDeps) {}

  /**
   * Applies trash, version, activity and link-index side effects for every file
   * the merge touched between `fromRef` and `toRef` (`fromRef` null = the repo had no commit yet). Never throws: each file and
   * each effect is isolated, failures only go to the log (R5).
   */
  async apply(vaultId: string, cwd: string, fromRef: string | null, toRef: string): Promise<SyncSideEffectsResult> {
    const result: SyncSideEffectsResult = { trashed: 0, versioned: 0, moved: 0, perFileActivity: false }

    let changes: GitFileChange[]
    try {
      changes = (await this.deps.gitCli.diffNameStatus(cwd, fromRef, toRef))
        .filter((change) => !isHiddenPath(change.path) && !(change.oldPath !== undefined && isHiddenPath(change.oldPath)))
    } catch (error) {
      this.warn('Could not list the files changed by the sync', vaultId, error)
      return result
    }

    result.perFileActivity = changes.length <= MAX_PER_FILE_ACTIVITY

    for (const change of changes) {
      try {
        await this.applyOne(vaultId, cwd, fromRef, change, result)
      } catch (error) {
        this.warn('Sync side effects failed for a file', vaultId, error, change.path)
      }
    }
    return result
  }

  private async applyOne(
    vaultId: string,
    cwd: string,
    fromRef: string | null,
    change: GitFileChange,
    result: SyncSideEffectsResult,
  ): Promise<void> {
    const { gitCli, trashService, versionService, linkIndexHook } = this.deps

    if (change.status === 'D') {
      const previous = fromRef === null ? null : await gitCli.showFileAt(cwd, fromRef, change.path)
      if (previous) {
        await this.guard(vaultId, change.path, async () => {
          await trashService.addFromContent(vaultId, change.path, previous)
          result.trashed++
        })
      }
      await this.guard(vaultId, change.path, async () => { await linkIndexHook?.onFileDeleted(vaultId, change.path) })
      this.record(result, vaultId, { type: eventTypeFor('D', change.path), path: change.path })
      return
    }

    if (change.status === 'R' && change.oldPath !== undefined) {
      const oldPath = change.oldPath
      await this.guard(vaultId, change.path, async () => { await versionService.moveVersions(vaultId, oldPath, change.path) })
      await this.guard(vaultId, change.path, async () => { await linkIndexHook?.onFileRenamed(vaultId, oldPath, change.path) })
      result.moved++
      this.record(result, vaultId, { type: 'note.moved', path: change.path, oldPath })
      return
    }

    if (change.status === 'M') {
      const previous = fromRef === null ? null : await gitCli.showFileAt(cwd, fromRef, change.path)
      if (previous && previous.length <= MAX_VERSION_BYTES) {
        await this.guard(vaultId, change.path, async () => {
          await versionService.createVersion(vaultId, change.path, previous)
          result.versioned++
        })
      }
    }

    // A and M: keep the link index in step with what is now on disk.
    await this.guard(vaultId, change.path, async () => { await this.reindex(vaultId, cwd, change.path) })
    this.record(result, vaultId, { type: eventTypeFor(change.status === 'M' ? 'M' : 'A', change.path), path: change.path })
  }

  private async reindex(vaultId: string, cwd: string, path: string): Promise<void> {
    if (!this.deps.linkIndexHook) return
    const buffer = await readFile(join(cwd, path))
    // Binary files carry no links/tags; a NUL byte is the cheap, reliable tell.
    if (buffer.length > MAX_INDEX_BYTES || buffer.includes(0)) return
    this.deps.linkIndexHook.onFileSaved(vaultId, path, buffer.toString('utf-8'))
  }

  private record(
    result: SyncSideEffectsResult,
    vaultId: string,
    event: { type: ActivityEventType; path: string; oldPath?: string },
  ): void {
    if (!result.perFileActivity || !this.deps.recordActivity) return
    try {
      this.deps.recordActivity(vaultId, { ...event, user: ACTOR_NAME, origin: 'git-sync' })
    } catch (error) {
      this.warn('Recording sync activity failed', vaultId, error, event.path)
    }
  }

  private async guard(vaultId: string, path: string, effect: () => Promise<void>): Promise<void> {
    try {
      await effect()
    } catch (error) {
      this.warn('Sync side effect failed', vaultId, error, path)
    }
  }

  private warn(message: string, vaultId: string, error: unknown, path?: string): void {
    this.deps.logger.warn(message, {
      vaultId,
      ...(path !== undefined ? { path } : {}),
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
