// GitCli — thin wrapper around the native `git` binary (shell-out).
//
// Security notes:
// - Always uses execFile with an argument array, never a shell string —
//   remote URLs and branch names are user input and must never be
//   interpolated into a shell command.
// - HTTPS credentials are never placed in argv or in the remote URL (both
//   are visible to other local users via `ps`/`/proc`). Instead, a
//   short-lived GIT_ASKPASS script reads the token from an environment
//   variable scoped to that single `git` invocation.
// - SSH private keys are written to a per-run temp file (mode 0600) deleted
//   in a `finally` block, and host keys are pinned to a per-remote
//   known_hosts file that persists across runs (TOFU, not reset every time).

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, rm, mkdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { GitCommandFailedError } from './errors.js'
import type { GitAuthContext } from './types.js'

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 2 * 60 * 1000
const SYNC_AUTHOR_NAME = 'Slatebase Sync'
const SYNC_AUTHOR_EMAIL = 'sync@slatebase.local'

/**
 * Askpass script: git invokes it as `<script> "Username for '<url>': "` and
 * `<script> "Password for '<url>': "`. It never receives the token as an
 * argument — it reads it from its own environment (SLATEBASE_GIT_TOKEN),
 * inherited only for this one `git` invocation.
 */
const ASKPASS_SCRIPT = `#!/bin/sh
case "$1" in
  Username*) printf '%s' "slatebase-sync" ;;
  *) printf '%s' "$SLATEBASE_GIT_TOKEN" ;;
esac
`

function shellQuoteSingle(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * Config overrides prepended to *every* `git` invocation (before the
 * subcommand, which is where `-c` has to sit).
 *
 * `core.symlinks=false` makes git check symlinks out as regular files whose
 * content is the link target instead of materializing real links in the
 * worktree. A vault is a directory the API serves files from, and a symlink
 * merged in from a hostile or compromised remote (`notes/x -> ../..`) would
 * otherwise point straight at the sibling `sessions/` and `users/`
 * directories under the same data dir. Nothing is lost for legitimate repos —
 * the entry still round-trips as a symlink on push.
 *
 * Deliberately passed via `-c` rather than written with `git config` in
 * `init()`: the latter only ever reaches repos Slatebase initialized itself
 * and would leave pre-existing working copies unprotected.
 */
const GLOBAL_CONFIG_ARGS = ['-c', 'core.symlinks=false']

export const CONFLICT_STATUS_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'UD', 'DU'])

/** Git's well-known empty-tree object hash — valid in every repository, used to diff a ref against "nothing" (e.g. a repo's very first commit). */
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

export interface IGitCli {
  isRepo(cwd: string): Promise<boolean>
  init(cwd: string, initialBranch: string): Promise<void>
  configureIdentity(cwd: string): Promise<void>
  remoteAddOrSetUrl(cwd: string, remoteName: string, url: string): Promise<void>
  hasUncommittedChanges(cwd: string): Promise<boolean>
  hasCommits(cwd: string): Promise<boolean>
  commitAll(cwd: string, message: string): Promise<void>
  fetch(cwd: string, remoteName: string, branch: string, auth: GitAuthContext): Promise<void>
  mergeNoEdit(cwd: string, remoteName: string, branch: string): Promise<'merged' | 'up-to-date' | 'conflict'>
  conflictedFiles(cwd: string): Promise<string[]>
  push(cwd: string, remoteName: string, branch: string, auth: GitAuthContext): Promise<void>
  /** Current HEAD commit hash, or `null` if the repo/branch has no commits yet. */
  getHead(cwd: string): Promise<string | null>
  /** Names of files that differ between two commits. `fromRef: null` diffs against the empty tree (e.g. a fresh first commit). */
  diffNameOnly(cwd: string, fromRef: string | null, toRef: string): Promise<string[]>
}

export class GitCli implements IGitCli {
  /**
   * Checks for a `.git` literally inside `cwd` — deliberately NOT
   * `git rev-parse --is-inside-work-tree`, which walks up parent
   * directories and reports `true` as soon as `cwd` is merely nested under
   * *any* repository. A vault folder living inside an unrelated outer repo
   * (e.g. Slatebase's own project checkout, when its data directory isn't
   * gitignored) would then look "already initialized", skip `init()`, and
   * every subsequent command would silently operate on that OUTER repo
   * instead — this happened for real and corrupted the host project's own
   * git history. Requiring `.git` to exist exactly at `cwd` guarantees
   * `init()` always creates a properly isolated nested repo there instead.
   */
  async isRepo(cwd: string): Promise<boolean> {
    try {
      await stat(join(cwd, '.git'))
      return true
    } catch {
      return false
    }
  }

  async init(cwd: string, initialBranch: string): Promise<void> {
    // `git init --initial-branch` needs git >= 2.28. Pointing HEAD at the
    // target branch's ref directly works on any git version and is safe
    // before the first commit exists (HEAD is just a symbolic ref until then).
    await this.run(cwd, ['init'])
    await this.run(cwd, ['symbolic-ref', 'HEAD', `refs/heads/${initialBranch}`])
  }

  async configureIdentity(cwd: string): Promise<void> {
    await this.run(cwd, ['config', 'user.name', SYNC_AUTHOR_NAME])
    await this.run(cwd, ['config', 'user.email', SYNC_AUTHOR_EMAIL])
  }

  async remoteAddOrSetUrl(cwd: string, remoteName: string, url: string): Promise<void> {
    try {
      await this.run(cwd, ['remote', 'add', remoteName, url])
    } catch {
      await this.run(cwd, ['remote', 'set-url', remoteName, url])
    }
  }

  async hasUncommittedChanges(cwd: string): Promise<boolean> {
    const { stdout } = await this.run(cwd, ['status', '--porcelain=v1'])
    return stdout.trim().length > 0
  }

  async hasCommits(cwd: string): Promise<boolean> {
    try {
      await this.run(cwd, ['rev-parse', '--verify', 'HEAD'])
      return true
    } catch {
      return false
    }
  }

  async commitAll(cwd: string, message: string): Promise<void> {
    await this.run(cwd, ['add', '-A'])
    if (!(await this.hasUncommittedChanges(cwd))) return
    await this.run(cwd, ['commit', '-m', message])
  }

  async fetch(cwd: string, remoteName: string, branch: string, auth: GitAuthContext): Promise<void> {
    await this.runWithAuth(cwd, ['fetch', remoteName, branch], auth)
  }

  async mergeNoEdit(cwd: string, remoteName: string, branch: string): Promise<'merged' | 'up-to-date' | 'conflict'> {
    try {
      const { stdout } = await this.run(cwd, ['merge', '--no-edit', `${remoteName}/${branch}`])
      return /already up to date/i.test(stdout) ? 'up-to-date' : 'merged'
    } catch (error) {
      const conflicts = await this.conflictedFiles(cwd)
      if (conflicts.length > 0) return 'conflict'
      throw error
    }
  }

  async conflictedFiles(cwd: string): Promise<string[]> {
    const { stdout } = await this.run(cwd, ['-c', 'core.quotePath=false', 'status', '--porcelain=v1'])
    const files: string[] = []
    for (const line of stdout.split('\n')) {
      if (line.length < 3) continue
      const statusCode = line.slice(0, 2)
      if (CONFLICT_STATUS_CODES.has(statusCode)) {
        files.push(line.slice(3).trim())
      }
    }
    return files
  }

  async push(cwd: string, remoteName: string, branch: string, auth: GitAuthContext): Promise<void> {
    await this.runWithAuth(cwd, ['push', remoteName, branch], auth)
  }

  async getHead(cwd: string): Promise<string | null> {
    try {
      const { stdout } = await this.run(cwd, ['rev-parse', 'HEAD'])
      return stdout.trim()
    } catch {
      return null
    }
  }

  async diffNameOnly(cwd: string, fromRef: string | null, toRef: string): Promise<string[]> {
    const { stdout } = await this.run(cwd, ['diff', '--name-only', fromRef ?? EMPTY_TREE_HASH, toRef])
    return stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async run(cwd: string, args: string[], extraEnv?: Record<string, string>): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync('git', [...GLOBAL_CONFIG_ARGS, ...args], {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extraEnv },
        maxBuffer: 16 * 1024 * 1024,
      })
    } catch (error) {
      const stderr = error && typeof error === 'object' && 'stderr' in error ? String((error as { stderr: unknown }).stderr) : String(error)
      throw new GitCommandFailedError(args, stderr)
    }
  }

  private async runWithAuth(cwd: string, args: string[], auth: GitAuthContext): Promise<{ stdout: string; stderr: string }> {
    const tmpDir = await mkdtemp(join(tmpdir(), 'slatebase-git-sync-'))
    try {
      if (auth.method === 'https-token') {
        const askpassPath = join(tmpDir, 'askpass.sh')
        await writeFile(askpassPath, ASKPASS_SCRIPT, { mode: 0o700 })
        return await this.run(cwd, args, {
          GIT_ASKPASS: askpassPath,
          SLATEBASE_GIT_TOKEN: auth.token,
        })
      }

      const keyPath = join(tmpDir, 'id_key')
      // A key pasted into a browser <textarea> on Windows can pick up CRLF
      // line endings. OpenSSH's key parser is strict about PEM formatting
      // and rejects that with an opaque "error in libcrypto: unsupported"
      // rather than a clear "bad line ending" — normalize before writing.
      const normalizedKey = auth.privateKey.replace(/\r\n/g, '\n')
      const keyContent = normalizedKey.endsWith('\n') ? normalizedKey : `${normalizedKey}\n`
      await writeFile(keyPath, keyContent, { mode: 0o600 })
      await mkdir(dirname(auth.knownHostsPath), { recursive: true })

      const sshCommand = [
        'ssh',
        '-i', shellQuoteSingle(keyPath),
        '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', `UserKnownHostsFile=${shellQuoteSingle(auth.knownHostsPath)}`,
      ].join(' ')

      return await this.run(cwd, args, { GIT_SSH_COMMAND: sshCommand })
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  }
}
