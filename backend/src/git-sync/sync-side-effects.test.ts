// SyncSideEffects — unit tests with fakes (no real git, no real services).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SyncSideEffects, MAX_PER_FILE_ACTIVITY } from './sync-side-effects.js'
import type { GitFileChange, IGitCli } from './git-cli.js'
import type { ActivityEventInput } from '../activity/types.js'
import type { ILogger } from '../logger/index.js'

function createLogger(): ILogger & { warnings: string[] } {
  const warnings: string[] = []
  return {
    warnings,
    debug: () => {},
    info: () => {},
    warn: (message: string) => { warnings.push(message) },
    error: () => {},
  }
}

describe('SyncSideEffects', () => {
  let cwd: string
  let changes: GitFileChange[]
  let oldContent: Record<string, Buffer>
  let trashed: Array<{ path: string; content: string }>
  let versions: Array<{ path: string; content: string }>
  let movedVersions: Array<[string, string]>
  let activity: ActivityEventInput[]
  let indexCalls: string[]
  let logger: ReturnType<typeof createLogger>
  let sideEffects: SyncSideEffects

  function build(overrides: { withActivity?: boolean; trashFails?: boolean } = {}): SyncSideEffects {
    const gitCli = {
      diffNameStatus: async () => changes,
      showFileAt: async (_cwd: string, _ref: string, file: string) => oldContent[file] ?? null,
    } as unknown as IGitCli
    return new SyncSideEffects({
      gitCli,
      trashService: {
        addFromContent: async (_v, path, content) => {
          if (overrides.trashFails) throw new Error('disk full')
          trashed.push({ path, content: content.toString('utf-8') })
          return { id: 'e', originalPath: path, deletedAt: '', isDirectory: false }
        },
      },
      versionService: {
        createVersion: async (_v, path, content) => { versions.push({ path, content: content.toString('utf-8') }) },
        moveVersions: async (_v, from, to) => { movedVersions.push([from, to]) },
      },
      logger,
      ...(overrides.withActivity === false ? {} : { recordActivity: (_v: string, event: ActivityEventInput) => { activity.push(event) } }),
      linkIndexHook: {
        onFileSaved: (_v, path) => { indexCalls.push(`saved:${path}`) },
        onFileDeleted: (_v, path) => { indexCalls.push(`deleted:${path}`) },
        onFileRenamed: (_v, from, to) => { indexCalls.push(`renamed:${from}>${to}`) },
      },
    })
  }

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'sync-fx-'))
    changes = []
    oldContent = {}
    trashed = []
    versions = []
    movedVersions = []
    activity = []
    indexCalls = []
    logger = createLogger()
    sideEffects = build()
  })

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  it('puts a deleted file into the trash with its old content', async () => {
    changes = [{ status: 'D', path: 'notes/gone.md' }]
    oldContent['notes/gone.md'] = Buffer.from('old body')

    const result = await sideEffects.apply('v1', cwd, 'a', 'b')

    expect(trashed).toEqual([{ path: 'notes/gone.md', content: 'old body' }])
    expect(result.trashed).toBe(1)
    expect(indexCalls).toEqual(['deleted:notes/gone.md'])
    expect(activity).toEqual([{ type: 'note.deleted', path: 'notes/gone.md', user: 'Git-Sync', origin: 'git-sync' }])
  })

  it('creates a version from the old content of a modified file', async () => {
    changes = [{ status: 'M', path: 'a.md' }]
    oldContent['a.md'] = Buffer.from('before')
    await writeFile(join(cwd, 'a.md'), 'after')

    const result = await sideEffects.apply('v1', cwd, 'a', 'b')

    expect(versions).toEqual([{ path: 'a.md', content: 'before' }])
    expect(result.versioned).toBe(1)
    expect(indexCalls).toEqual(['saved:a.md'])
    expect(activity[0]?.type).toBe('note.edited')
  })

  it('records a created file without trash or version', async () => {
    changes = [{ status: 'A', path: 'new.md' }]
    await writeFile(join(cwd, 'new.md'), 'hello')

    await sideEffects.apply('v1', cwd, 'a', 'b')

    expect(trashed).toEqual([])
    expect(versions).toEqual([])
    expect(indexCalls).toEqual(['saved:new.md'])
    expect(activity[0]?.type).toBe('note.created')
  })

  it('moves versions and the link index along with a rename', async () => {
    changes = [{ status: 'R', path: 'b.md', oldPath: 'a.md' }]

    const result = await sideEffects.apply('v1', cwd, 'a', 'b')

    expect(movedVersions).toEqual([['a.md', 'b.md']])
    expect(indexCalls).toEqual(['renamed:a.md>b.md'])
    expect(result.moved).toBe(1)
    expect(trashed).toEqual([])
    expect(activity).toEqual([{ type: 'note.moved', path: 'b.md', oldPath: 'a.md', user: 'Git-Sync', origin: 'git-sync' }])
  })

  it('maps canvas and base files to their own event types', async () => {
    changes = [{ status: 'A', path: 'board.canvas' }, { status: 'M', path: 'tasks.base' }]
    oldContent['tasks.base'] = Buffer.from('x')
    await writeFile(join(cwd, 'board.canvas'), '{}')
    await writeFile(join(cwd, 'tasks.base'), 'y')

    await sideEffects.apply('v1', cwd, 'a', 'b')

    expect(activity.map((event) => event.type)).toEqual(['canvas.created', 'base.edited'])
  })

  it('skips hidden paths completely', async () => {
    changes = [
      { status: 'D', path: '.obsidian/app.json' },
      { status: 'M', path: 'notes/.hidden/x.md' },
      { status: 'D', path: '.gitignore' },
    ]
    oldContent['.obsidian/app.json'] = Buffer.from('{}')

    await sideEffects.apply('v1', cwd, 'a', 'b')

    expect(trashed).toEqual([])
    expect(versions).toEqual([])
    expect(activity).toEqual([])
    expect(indexCalls).toEqual([])
  })

  it('does not read binary files into the link index', async () => {
    changes = [{ status: 'A', path: 'img.png' }]
    await writeFile(join(cwd, 'img.png'), Buffer.from([0x89, 0x50, 0x00, 0x47]))

    await sideEffects.apply('v1', cwd, 'a', 'b')

    expect(indexCalls).toEqual([])
    expect(activity[0]?.type).toBe('note.created')
  })

  it('records no per-file activity above the limit but still trashes', async () => {
    changes = Array.from({ length: MAX_PER_FILE_ACTIVITY + 1 }, (_, i) => ({ status: 'D' as const, path: `f${i}.md` }))
    for (const change of changes) oldContent[change.path] = Buffer.from('x')

    const result = await sideEffects.apply('v1', cwd, 'a', 'b')

    expect(result.perFileActivity).toBe(false)
    expect(activity).toEqual([])
    expect(result.trashed).toBe(MAX_PER_FILE_ACTIVITY + 1)
  })

  it('works without an activity recorder', async () => {
    sideEffects = build({ withActivity: false })
    changes = [{ status: 'D', path: 'a.md' }]
    oldContent['a.md'] = Buffer.from('x')

    const result = await sideEffects.apply('v1', cwd, 'a', 'b')

    expect(result.trashed).toBe(1)
    expect(activity).toEqual([])
  })

  it('swallows a failing effect, logs it and continues with the next file', async () => {
    sideEffects = build({ trashFails: true })
    changes = [{ status: 'D', path: 'a.md' }, { status: 'A', path: 'b.md' }]
    oldContent['a.md'] = Buffer.from('x')
    await mkdir(join(cwd, 'sub'), { recursive: true })
    await writeFile(join(cwd, 'b.md'), 'b')

    const result = await sideEffects.apply('v1', cwd, 'a', 'b')

    expect(result.trashed).toBe(0)
    expect(logger.warnings.length).toBeGreaterThan(0)
    expect(activity.map((event) => event.path)).toEqual(['a.md', 'b.md'])
  })

  it('returns an empty result when the file list cannot be read', async () => {
    const failing = new SyncSideEffects({
      gitCli: { diffNameStatus: async () => { throw new Error('boom') } } as unknown as IGitCli,
      trashService: { addFromContent: async () => { throw new Error('unused') } },
      versionService: { createVersion: async () => {}, moveVersions: async () => {} },
      logger,
    })

    const result = await failing.apply('v1', cwd, 'a', 'b')

    expect(result).toEqual({ trashed: 0, versioned: 0, moved: 0, perFileActivity: false })
    expect(logger.warnings).toContain('Could not list the files changed by the sync')
  })
})
