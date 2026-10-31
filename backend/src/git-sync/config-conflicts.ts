// Resolves merge conflicts in Obsidian's JSON config files on its own (see config-merge.ts for the
// rules). Called by the sync engine when `git merge` stopped on conflicts: every file this module can
// merge is written, staged and reported as resolved; everything else stays conflicted, untouched, for
// the user. Never throws — a file that fails is left as git wrote it.

import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ILogger } from '../logger/index.js'
import { AUTO_RESOLVABLE_FILES, mergeObsidianConfig, type JsonObject } from './config-merge.js'
import type { IGitCli } from './git-cli.js'

const CONFIG_FILE = /^\.obsidian\/([^/]+\.json)$/

function parseObject(raw: string | null): JsonObject | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as JsonObject) : null
  } catch {
    return null
  }
}

/**
 * Which side counts as newer for keys both changed. Both instances must pick the same winner when
 * they merge the same two commits, so a tie is broken by comparing the content, which is the same
 * on both ends (only "ours" and "theirs" swap).
 */
function isOursNewer(oursTime: number, theirsTime: number, oursRaw: string, theirsRaw: string): boolean {
  if (oursTime !== theirsTime) return oursTime > theirsTime
  return oursRaw > theirsRaw
}

/** Returns the files from `conflictFiles` that were merged and staged. */
export async function resolveConfigConflicts(deps: {
  gitCli: IGitCli
  cwd: string
  conflictFiles: string[]
  logger: ILogger
  vaultId: string
}): Promise<string[]> {
  const { gitCli, cwd, conflictFiles, logger, vaultId } = deps
  const resolved: string[] = []

  for (const file of conflictFiles) {
    const name = CONFIG_FILE.exec(file)?.[1]
    if (name === undefined || !(AUTO_RESOLVABLE_FILES as readonly string[]).includes(name)) continue
    try {
      const oursRaw = await gitCli.showStage(cwd, 2, file)
      const theirsRaw = await gitCli.showStage(cwd, 3, file)
      const ours = parseObject(oursRaw)
      const theirs = parseObject(theirsRaw)
      if (oursRaw === null || theirsRaw === null || ours === null || theirs === null) continue // deleted on one side, or not JSON
      const baseRaw = await gitCli.showStage(cwd, 1, file)
      const base = parseObject(baseRaw)
      if (baseRaw !== null && base === null) continue

      const oursTime = await gitCli.lastChangeTime(cwd, 'HEAD', file)
      const theirsTime = await gitCli.lastChangeTime(cwd, 'MERGE_HEAD', file)
      const result = mergeObsidianConfig(name, base, ours, theirs, isOursNewer(oursTime, theirsTime, oursRaw, theirsRaw))
      if (result === null) continue

      const trailingNewline = oursRaw.endsWith('\n') ? '\n' : ''
      await writeFile(join(cwd, file), `${JSON.stringify(result.merged, null, 2)}${trailingNewline}`, 'utf-8')
      await gitCli.stageFile(cwd, file)
      resolved.push(file)

      for (const decision of result.decisions) {
        logger.warn(
          `[git-sync] vault=${vaultId} file=${name} path=${decision.path} changed on both devices; kept the ${decision.kept === 'ours' ? 'local' : 'remote'} (newer) value ${decision.kept === 'ours' ? decision.ours : decision.theirs} over ${decision.kept === 'ours' ? decision.theirs : decision.ours}`,
          { vaultId, file: name, path: decision.path },
        )
      }
      logger.info('Git-sync resolved a config file conflict automatically', { vaultId, file, decisions: result.decisions.length })
    } catch (error) {
      logger.warn('Git-sync could not resolve a config file conflict automatically; leaving it for manual resolution', {
        vaultId, file, message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return resolved
}
