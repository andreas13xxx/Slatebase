import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ILogger } from '../logger/index.js'
import { GitCli } from './git-cli.js'
import { resolveConfigConflicts } from './config-conflicts.js'

const execFileAsync = promisify(execFile)

// Real git, real conflicts: two clones of one bare remote change the same line of a JSON file.
describe('resolveConfigConflicts (real git)', () => {
  let root: string
  let ours: string
  let theirs: string
  const gitCli = new GitCli()
  const logger: ILogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

  const git = async (cwd: string, args: string[], date?: string) => {
    await execFileAsync('git', args, {
      cwd,
      env: { ...process.env, ...(date ? { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : {}) },
    })
  }
  const write = async (cwd: string, file: string, content: string) => {
    await mkdir(join(cwd, file, '..'), { recursive: true })
    await writeFile(join(cwd, file), content)
  }
  const commit = async (cwd: string, message: string, date: string) => {
    await git(cwd, ['add', '-A'])
    await git(cwd, ['commit', '-q', '-m', message], date)
  }
  const setIdentity = async (cwd: string) => {
    await git(cwd, ['config', 'user.name', 'test'])
    await git(cwd, ['config', 'user.email', 'test@example.com'])
  }

  /** Base commit in `ours`, pushed; `theirs` clones it. Returns when both are ready to diverge. */
  const setUp = async (base: Record<string, string>) => {
    const remote = join(root, 'remote.git')
    await git(root, ['init', '-q', '--bare', '-b', 'main', remote])
    ours = join(root, 'ours')
    await mkdir(ours)
    await git(ours, ['init', '-q', '-b', 'main'])
    await setIdentity(ours)
    for (const [file, content] of Object.entries(base)) await write(ours, file, content)
    await commit(ours, 'base', '2026-01-01T00:00:00Z')
    await git(ours, ['remote', 'add', 'origin', remote])
    await git(ours, ['push', '-q', 'origin', 'main'])
    theirs = join(root, 'theirs')
    await git(root, ['clone', '-q', remote, theirs])
    await setIdentity(theirs)
  }

  const mergeTheirs = async () => {
    await git(theirs, ['push', '-q', 'origin', 'main'])
    await git(ours, ['fetch', '-q', 'origin', 'main'])
    return gitCli.mergeNoEdit(ours, 'origin', 'main')
  }
  const resolve = async () => {
    const conflictFiles = await gitCli.conflictedFiles(ours)
    const resolved = await resolveConfigConflicts({ gitCli, cwd: ours, conflictFiles, logger, vaultId: 'v1' })
    return { conflictFiles, resolved }
  }
  const json = async (cwd: string, file: string) => JSON.parse(await readFile(join(cwd, file), 'utf-8')) as unknown

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'config-conflicts-'))
    vi.clearAllMocks()
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })

  it('merges two devices that changed different keys of one line, and the merge can be committed', async () => {
    await setUp({ '.obsidian/app.json': '{"a":1,"b":1}' })
    await write(ours, '.obsidian/app.json', '{"a":2,"b":1}')
    await commit(ours, 'ours', '2026-01-02T00:00:00Z')
    await write(theirs, '.obsidian/app.json', '{"a":1,"b":2}')
    await commit(theirs, 'theirs', '2026-01-03T00:00:00Z')

    expect(await mergeTheirs()).toBe('conflict')
    const { conflictFiles, resolved } = await resolve()

    expect(conflictFiles).toEqual(['.obsidian/app.json'])
    expect(resolved).toEqual(['.obsidian/app.json'])
    expect(await json(ours, '.obsidian/app.json')).toEqual({ a: 2, b: 2 })
    expect(await gitCli.conflictedFiles(ours)).toEqual([])
    await gitCli.commitAll(ours, 'merge')
    await git(ours, ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('lets the newer commit win a key both changed and logs the decision', async () => {
    await setUp({ '.obsidian/app.json': '{"tabSize":4}' })
    await write(ours, '.obsidian/app.json', '{"tabSize":2}')
    await commit(ours, 'ours', '2026-01-05T00:00:00Z')
    await write(theirs, '.obsidian/app.json', '{"tabSize":8}')
    await commit(theirs, 'theirs', '2026-01-03T00:00:00Z')

    await mergeTheirs()
    await resolve()

    expect(await json(ours, '.obsidian/app.json')).toEqual({ tabSize: 2 })
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(String((logger.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).toContain('path=tabSize')
  })

  it('takes the remote value when the remote commit is newer', async () => {
    await setUp({ '.obsidian/app.json': '{"tabSize":4}' })
    await write(ours, '.obsidian/app.json', '{"tabSize":2}')
    await commit(ours, 'ours', '2026-01-02T00:00:00Z')
    await write(theirs, '.obsidian/app.json', '{"tabSize":8}')
    await commit(theirs, 'theirs', '2026-01-09T00:00:00Z')

    await mergeTheirs()
    await resolve()

    expect(await json(ours, '.obsidian/app.json')).toEqual({ tabSize: 8 })
  })

  it('merges bookmarks added on both devices', async () => {
    const file = (path: string) => ({ type: 'file', path })
    await setUp({ '.obsidian/bookmarks.json': JSON.stringify({ items: [file('a.md')] }) })
    await write(ours, '.obsidian/bookmarks.json', JSON.stringify({ items: [file('a.md'), file('ours.md')] }))
    await commit(ours, 'ours', '2026-01-02T00:00:00Z')
    await write(theirs, '.obsidian/bookmarks.json', JSON.stringify({ items: [file('a.md'), file('theirs.md')] }))
    await commit(theirs, 'theirs', '2026-01-03T00:00:00Z')

    expect(await mergeTheirs()).toBe('conflict')
    await resolve()

    expect(await json(ours, '.obsidian/bookmarks.json')).toEqual({ items: [file('a.md'), file('ours.md'), file('theirs.md')] })
  })

  it('leaves a note, an unknown config file and invalid JSON conflicted, but resolves the config file it can', async () => {
    await setUp({
      'note.md': 'one\n',
      '.obsidian/core-plugins.json': '{"x":1}',
      '.obsidian/hotkeys.json': '{"a":[]}',
      '.obsidian/graph.json': '{"scale":1}',
    })
    await write(ours, 'note.md', 'ours\n')
    await write(ours, '.obsidian/core-plugins.json', '{"x":2}')
    await write(ours, '.obsidian/hotkeys.json', '{"a":[],"b":[]}')
    await write(ours, '.obsidian/graph.json', '{"scale":2}')
    await commit(ours, 'ours', '2026-01-02T00:00:00Z')
    await write(theirs, 'note.md', 'theirs\n')
    await write(theirs, '.obsidian/core-plugins.json', '{"x":3}')
    await write(theirs, '.obsidian/hotkeys.json', '{"a":[],"c":[]}')
    await write(theirs, '.obsidian/graph.json', '{"scale":2,')
    await commit(theirs, 'theirs', '2026-01-03T00:00:00Z')

    expect(await mergeTheirs()).toBe('conflict')
    const { resolved } = await resolve()

    expect(resolved).toEqual(['.obsidian/hotkeys.json'])
    expect((await gitCli.conflictedFiles(ours)).sort()).toEqual(['.obsidian/core-plugins.json', '.obsidian/graph.json', 'note.md'])
    expect(await readFile(join(ours, 'note.md'), 'utf-8')).toContain('<<<<<<<')
    expect(await json(ours, '.obsidian/hotkeys.json')).toEqual({ a: [], b: [], c: [] })
  })

  it('leaves a file conflicted that one side deleted', async () => {
    await setUp({ '.obsidian/app.json': '{"a":1}' })
    await git(ours, ['rm', '-q', '.obsidian/app.json'])
    await commit(ours, 'ours', '2026-01-02T00:00:00Z')
    await write(theirs, '.obsidian/app.json', '{"a":2}')
    await commit(theirs, 'theirs', '2026-01-03T00:00:00Z')

    expect(await mergeTheirs()).toBe('conflict')
    expect((await resolve()).resolved).toEqual([])
  })
})
