// GitCli integration tests — exercise the real `git` binary against local,
// network-free repos (a bare "remote" directory used as the push/fetch
// target instead of a real HTTPS/SSH host) so the actual command wiring is
// verified rather than a mocked approximation of it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir, lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GitCli } from './git-cli.js'
import type { GitAuthContext } from './types.js'

const execFileAsync = promisify(execFile)

// Local file-path remotes never invoke the askpass helper, so any auth
// context is accepted without actually being used.
const DUMMY_AUTH: GitAuthContext = { method: 'https-token', token: 'unused' }

async function initBareRemote(path: string): Promise<void> {
  await execFileAsync('git', ['init', '--bare', '--initial-branch', 'main', path])
}

async function mkWorkDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

// Every test here shells out to the real `git` binary several times. Vitest's
// 5s default is not enough for that on Windows under coverage instrumentation,
// where process spawn plus antivirus/OneDrive file locking (see AGENTS.md) adds
// up — the suite was flaky for that reason, not for a logic reason.
describe('GitCli', { timeout: 30000 }, () => {
  let workDir: string
  let remoteDir: string
  let cli: GitCli
  const extraDirs: string[] = []

  beforeEach(async () => {
    workDir = await mkWorkDir('git-cli-work-')
    remoteDir = await mkWorkDir('git-cli-remote-')
    await rm(remoteDir, { recursive: true, force: true })
    await initBareRemote(remoteDir)
    cli = new GitCli()
  })

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true })
    await rm(remoteDir, { recursive: true, force: true })
    for (const dir of extraDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('initializes a repo and reports isRepo correctly', async () => {
    expect(await cli.isRepo(workDir)).toBe(false)
    await cli.init(workDir, 'main')
    expect(await cli.isRepo(workDir)).toBe(true)
  })

  it('regression: does not mistake a folder merely nested inside an outer repo for an initialized one', async () => {
    // Reproduces the real incident: a vault folder living inside Slatebase's
    // own project checkout (an unrelated OUTER git repo) must never be
    // treated as "already a repo" just because `git rev-parse
    // --is-inside-work-tree` would say yes for any nested path — that skips
    // init() and lets every subsequent command operate on the outer repo.
    await execFileAsync('git', ['init', '--initial-branch', 'main', workDir]) // simulates the outer project repo
    await execFileAsync('git', ['-C', workDir, 'config', 'user.email', 'outer@example.invalid'])
    await execFileAsync('git', ['-C', workDir, 'config', 'user.name', 'Outer Repo'])
    await writeFile(join(workDir, '.gitignore'), 'data/\n') // mirrors Slatebase's own project .gitignore for backend/data/
    await writeFile(join(workDir, 'outer-file.md'), 'outer content')
    await execFileAsync('git', ['-C', workDir, 'add', '-A'])
    await execFileAsync('git', ['-C', workDir, 'commit', '-m', 'outer commit'])

    const nestedVaultDir = join(workDir, 'data', 'vaults', 'some-vault-id')
    await mkdir(nestedVaultDir, { recursive: true })

    expect(await cli.isRepo(nestedVaultDir)).toBe(false)

    await cli.init(nestedVaultDir, 'main')
    await cli.configureIdentity(nestedVaultDir)
    await writeFile(join(nestedVaultDir, 'note.md'), 'vault content')
    await cli.commitAll(nestedVaultDir, 'vault commit')

    // The nested repo is its own independent history...
    const { stdout: nestedLog } = await execFileAsync('git', ['-C', nestedVaultDir, 'log', '--oneline'])
    expect(nestedLog).toContain('vault commit')
    expect(nestedLog).not.toContain('outer commit')

    // ...and the outer repo was never touched by the vault's commit.
    const { stdout: outerLog } = await execFileAsync('git', ['-C', workDir, 'log', '--oneline'])
    expect(outerLog).toContain('outer commit')
    expect(outerLog).not.toContain('vault commit')
    const { stdout: outerStatus } = await execFileAsync('git', ['-C', workDir, 'status', '--porcelain=v1'])
    expect(outerStatus.trim()).toBe('')
  })

  it('commits only when there are pending changes', async () => {
    await cli.init(workDir, 'main')
    await cli.configureIdentity(workDir)

    expect(await cli.hasUncommittedChanges(workDir)).toBe(false)
    await cli.commitAll(workDir, 'no-op commit attempt') // must not throw on an empty tree

    await writeFile(join(workDir, 'note.md'), '# Hello')
    expect(await cli.hasUncommittedChanges(workDir)).toBe(true)

    await cli.commitAll(workDir, 'add note')
    expect(await cli.hasUncommittedChanges(workDir)).toBe(false)
  })

  it('reports hasCommits correctly for an empty vs. non-empty repo', async () => {
    await cli.init(workDir, 'main')
    await cli.configureIdentity(workDir)
    expect(await cli.hasCommits(workDir)).toBe(false)

    await writeFile(join(workDir, 'note.md'), '# Hello')
    await cli.commitAll(workDir, 'add note')
    expect(await cli.hasCommits(workDir)).toBe(true)
  })

  it('pushes to and fetches/merges cleanly from a remote', async () => {
    await cli.init(workDir, 'main')
    await cli.configureIdentity(workDir)
    await writeFile(join(workDir, 'note.md'), '# Hello')
    await cli.commitAll(workDir, 'add note')
    await cli.remoteAddOrSetUrl(workDir, 'origin', remoteDir)
    await cli.push(workDir, 'origin', 'main', DUMMY_AUTH)

    const workDir2 = await mkWorkDir('git-cli-work2-')
    extraDirs.push(workDir2)
    await cli.init(workDir2, 'main')
    await cli.configureIdentity(workDir2)
    await cli.remoteAddOrSetUrl(workDir2, 'origin', remoteDir)
    await cli.fetch(workDir2, 'origin', 'main', DUMMY_AUTH)

    const mergeResult = await cli.mergeNoEdit(workDir2, 'origin', 'main')
    expect(mergeResult).toBe('merged')

    const content = await readFile(join(workDir2, 'note.md'), 'utf-8')
    expect(content).toBe('# Hello')
  })

  it('reports up-to-date when nothing new was fetched', async () => {
    await cli.init(workDir, 'main')
    await cli.configureIdentity(workDir)
    await writeFile(join(workDir, 'note.md'), '# Hello')
    await cli.commitAll(workDir, 'add note')
    await cli.remoteAddOrSetUrl(workDir, 'origin', remoteDir)
    await cli.push(workDir, 'origin', 'main', DUMMY_AUTH)

    await cli.fetch(workDir, 'origin', 'main', DUMMY_AUTH)
    const mergeResult = await cli.mergeNoEdit(workDir, 'origin', 'main')
    expect(mergeResult).toBe('up-to-date')
  })

  it('detects a merge conflict and leaves conflict markers in the working tree', async () => {
    // A pushes the initial version of note.md
    await cli.init(workDir, 'main')
    await cli.configureIdentity(workDir)
    await writeFile(join(workDir, 'note.md'), 'line-A')
    await cli.commitAll(workDir, 'add note (A)')
    await cli.remoteAddOrSetUrl(workDir, 'origin', remoteDir)
    await cli.push(workDir, 'origin', 'main', DUMMY_AUTH)

    // B clones the same history, changes note.md, and pushes
    const workDirB = await mkWorkDir('git-cli-workB-')
    extraDirs.push(workDirB)
    await cli.init(workDirB, 'main')
    await cli.configureIdentity(workDirB)
    await cli.remoteAddOrSetUrl(workDirB, 'origin', remoteDir)
    await cli.fetch(workDirB, 'origin', 'main', DUMMY_AUTH)
    await cli.mergeNoEdit(workDirB, 'origin', 'main')
    await writeFile(join(workDirB, 'note.md'), 'line-B')
    await cli.commitAll(workDirB, 'change note (B)')
    await cli.push(workDirB, 'origin', 'main', DUMMY_AUTH)

    // A changes the same line differently, then fetches B's conflicting push
    await writeFile(join(workDir, 'note.md'), 'line-A-changed')
    await cli.commitAll(workDir, 'change note (A)')
    await cli.fetch(workDir, 'origin', 'main', DUMMY_AUTH)

    const mergeResult = await cli.mergeNoEdit(workDir, 'origin', 'main')
    expect(mergeResult).toBe('conflict')

    const conflicts = await cli.conflictedFiles(workDir)
    expect(conflicts).toEqual(['note.md'])

    const content = await readFile(join(workDir, 'note.md'), 'utf-8')
    expect(content).toContain('<<<<<<<')
    expect(content).toContain('>>>>>>>')
  })
})

describe('GitCli — symlinks from a remote', { timeout: 30000 }, () => {
  let workDir: string
  let remoteDir: string
  let scratchDir: string
  let hostileDir: string
  let cli: GitCli

  async function git(cwd: string, args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, { cwd })
    return stdout
  }

  beforeEach(async () => {
    workDir = await mkWorkDir('git-symlink-work-')
    scratchDir = await mkWorkDir('git-symlink-scratch-')
    hostileDir = await mkWorkDir('git-symlink-hostile-')
    remoteDir = await mkWorkDir('git-symlink-remote-')
    await rm(remoteDir, { recursive: true, force: true })
    await initBareRemote(remoteDir)
    cli = new GitCli()
  })

  afterEach(async () => {
    for (const dir of [workDir, scratchDir, hostileDir, remoteDir]) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  /**
   * Publishes a commit containing a symlink entry (mode 120000) to the bare
   * remote. Built with plumbing rather than `fs.symlink` on purpose: it needs
   * no symlink privilege, so this runs on Windows CI as well.
   */
  async function pushCommitWithSymlink(linkName: string, linkTarget: string): Promise<void> {
    await cli.init(hostileDir, 'main')
    await cli.configureIdentity(hostileDir)

    const targetFile = join(scratchDir, 'link-target')
    await writeFile(targetFile, linkTarget) // no trailing newline — the blob IS the target path
    const blobHash = (await git(hostileDir, ['hash-object', '-w', targetFile])).trim()

    await git(hostileDir, ['update-index', '--add', '--cacheinfo', `120000,${blobHash},${linkName}`])
    await git(hostileDir, ['commit', '-m', 'add symlink'])
    await cli.remoteAddOrSetUrl(hostileDir, 'origin', remoteDir)
    await cli.push(hostileDir, 'origin', 'main', DUMMY_AUTH)
  }

  it('materializes a merged-in symlink as a regular file, not a link', async () => {
    // The attack this closes: a symlink synced into a vault passes the
    // string-level path validation, and every read then follows it out of the
    // vault (`data/sessions/*.json` is one directory up). `core.symlinks=false`
    // is injected in GitCli.run(), the single chokepoint for every git call,
    // so it covers fetch/merge/checkout alike.
    await pushCommitWithSymlink('escape', '../..')

    await cli.init(workDir, 'main')
    await cli.configureIdentity(workDir)
    // Persist the opposite setting locally: only a `-c` override on the
    // command line beats it, which is exactly what this asserts.
    await git(workDir, ['config', 'core.symlinks', 'true'])
    await cli.remoteAddOrSetUrl(workDir, 'origin', remoteDir)
    await cli.fetch(workDir, 'origin', 'main', DUMMY_AUTH)

    expect(await cli.mergeNoEdit(workDir, 'origin', 'main')).toBe('merged')

    const entry = await lstat(join(workDir, 'escape'))
    expect(entry.isSymbolicLink()).toBe(false)
    expect(entry.isFile()).toBe(true)
    expect(await readFile(join(workDir, 'escape'), 'utf-8')).toBe('../..')
  })

  it('keeps the entry a symlink in git history — nothing is lost for legitimate repos', async () => {
    await pushCommitWithSymlink('link.md', 'note.md')

    await cli.init(workDir, 'main')
    await cli.configureIdentity(workDir)
    await cli.remoteAddOrSetUrl(workDir, 'origin', remoteDir)
    await cli.fetch(workDir, 'origin', 'main', DUMMY_AUTH)
    await cli.mergeNoEdit(workDir, 'origin', 'main')

    // Still recorded as mode 120000, so a later push hands the remote back the
    // symlink it sent — and the worktree does not look dirty because of it.
    expect(await git(workDir, ['ls-files', '-s', 'link.md'])).toMatch(/^120000 /)
    expect(await cli.hasUncommittedChanges(workDir)).toBe(false)
  })
})
