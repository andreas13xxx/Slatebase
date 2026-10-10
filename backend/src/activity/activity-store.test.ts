import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ActivityStore } from './activity-store.js'
import type { ILogger } from '../logger/index.js'
import type { ActivityEvent } from './types.js'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

const VAULT_ID = 'vault-1'

describe('ActivityStore', () => {
  let tmpDir: string
  let vaultDir: string
  let store: ActivityStore
  let logger: ILogger

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'activity-test-'))
    vaultDir = path.join(tmpDir, 'vault')
    await fs.mkdir(vaultDir, { recursive: true })
    logger = createMockLogger()
    store = new ActivityStore(() => vaultDir, logger)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  /** Read all persisted events for the vault (bypassing pagination). */
  async function readAll(): Promise<ActivityEvent[]> {
    const page = await store.query(VAULT_ID, { limit: 200 })
    return page.items
  }

  // ─── Basic recording ──────────────────────────────────────────────────────

  it('records a note.created event with id, timestamp and lastModified', async () => {
    await store.record(VAULT_ID, { type: 'note.created', path: 'Note.md', user: 'andreas' })
    const events = await readAll()
    expect(events).toHaveLength(1)
    const [evt] = events
    expect(evt?.type).toBe('note.created')
    expect(evt?.path).toBe('Note.md')
    expect(evt?.user).toBe('andreas')
    expect(evt?.id).toMatch(/^[0-9a-f]{12}$/)
    expect(evt?.timestamp).toBe(evt?.lastModified)
  })

  it('records a note.moved event carrying both old and new path (D3)', async () => {
    await store.record(VAULT_ID, {
      type: 'note.moved',
      path: 'New/Folder/Note.md',
      oldPath: 'Old/Note.md',
      user: 'andreas',
    })
    const [evt] = await readAll()
    expect(evt?.type).toBe('note.moved')
    expect(evt?.path).toBe('New/Folder/Note.md')
    expect(evt?.oldPath).toBe('Old/Note.md')
  })

  // ─── R1.5: hidden paths never recorded ─────────────────────────────────────

  it('never records a .slatebase-internal or dot-segment path (R1.5)', async () => {
    await store.record(VAULT_ID, { type: 'note.edited', path: '.slatebase/link-index.json', user: 'andreas' })
    await store.record(VAULT_ID, { type: 'note.edited', path: '.obsidian/app.json', user: 'andreas' })
    await store.record(VAULT_ID, { type: 'note.moved', path: 'Visible.md', oldPath: '.trash/x.md', user: 'andreas' })
    expect(await readAll()).toHaveLength(0)
  })

  // ─── D1: coalescing ────────────────────────────────────────────────────────

  it('coalesces rapid note.edited of the same file into one event (D1)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T02:00:00.000Z'))
    await store.record(VAULT_ID, { type: 'note.edited', path: 'A.md', user: 'andreas' })

    vi.setSystemTime(new Date('2026-10-10T02:00:30.000Z'))
    await store.record(VAULT_ID, { type: 'note.edited', path: 'A.md', user: 'andreas' })

    vi.setSystemTime(new Date('2026-10-10T02:00:50.000Z'))
    await store.record(VAULT_ID, { type: 'note.edited', path: 'A.md', user: 'andreas' })

    const events = await readAll()
    expect(events).toHaveLength(1)
    expect(events[0]?.timestamp).toBe('2026-10-10T02:00:00.000Z')
    expect(events[0]?.lastModified).toBe('2026-10-10T02:00:50.000Z')
  })

  it('starts a new event once the 60s window lapses without an edit (D1)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T02:00:00.000Z'))
    await store.record(VAULT_ID, { type: 'note.edited', path: 'A.md', user: 'andreas' })

    // 61s after the last edit → new window
    vi.setSystemTime(new Date('2026-10-10T02:01:01.000Z'))
    await store.record(VAULT_ID, { type: 'note.edited', path: 'A.md', user: 'andreas' })

    const events = await readAll()
    expect(events).toHaveLength(2)
  })

  it('does not coalesce edits of different files', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T02:00:00.000Z'))
    await store.record(VAULT_ID, { type: 'note.edited', path: 'A.md', user: 'andreas' })
    await store.record(VAULT_ID, { type: 'note.edited', path: 'B.md', user: 'andreas' })
    expect(await readAll()).toHaveLength(2)
  })

  it('never coalesces create/delete/move/restore (D1)', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T02:00:00.000Z'))
    await store.record(VAULT_ID, { type: 'note.created', path: 'A.md', user: 'andreas' })
    await store.record(VAULT_ID, { type: 'note.deleted', path: 'A.md', user: 'andreas' })
    await store.record(VAULT_ID, { type: 'note.restored', path: 'A.md', user: 'andreas' })
    expect(await readAll()).toHaveLength(3)
  })

  // ─── Query: type / time filters, pagination ────────────────────────────────

  it('filters by event type', async () => {
    await store.record(VAULT_ID, { type: 'note.created', path: 'A.md', user: 'andreas' })
    await store.record(VAULT_ID, { type: 'note.deleted', path: 'B.md', user: 'andreas' })
    const page = await store.query(VAULT_ID, { types: ['note.deleted'], limit: 50 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.type).toBe('note.deleted')
  })

  it('returns events newest first', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T01:00:00.000Z'))
    await store.record(VAULT_ID, { type: 'note.created', path: 'Old.md', user: 'andreas' })
    vi.setSystemTime(new Date('2026-10-10T03:00:00.000Z'))
    await store.record(VAULT_ID, { type: 'note.created', path: 'New.md', user: 'andreas' })
    vi.useRealTimers()

    const page = await store.query(VAULT_ID, { limit: 50 })
    expect(page.items[0]?.path).toBe('New.md')
    expect(page.items[1]?.path).toBe('Old.md')
  })

  it('paginates with a cursor without overlap or gaps', async () => {
    vi.useFakeTimers()
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(`2026-10-10T0${i}:00:00.000Z`))
      await store.record(VAULT_ID, { type: 'note.created', path: `N${i}.md`, user: 'andreas' })
    }
    vi.useRealTimers()

    const first = await store.query(VAULT_ID, { limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()

    const second = await store.query(VAULT_ID, first.nextCursor ? { limit: 2, cursor: first.nextCursor } : { limit: 2 })
    expect(second.items).toHaveLength(2)

    const third = await store.query(VAULT_ID, second.nextCursor ? { limit: 2, cursor: second.nextCursor } : { limit: 2 })
    expect(third.items).toHaveLength(1)
    expect(third.nextCursor).toBeNull()

    const paths = [...first.items, ...second.items, ...third.items].map(e => e.path)
    expect(new Set(paths).size).toBe(5)
  })

  it('returns an empty page for a vault with no activity', async () => {
    const page = await store.query('empty-vault', { limit: 50 })
    expect(page.items).toEqual([])
    expect(page.nextCursor).toBeNull()
  })

  // ─── D2: purge ─────────────────────────────────────────────────────────────

  it('purges day-files older than the retention window (D2)', async () => {
    const activityDir = path.join(vaultDir, '.slatebase', 'activity')
    await fs.mkdir(activityDir, { recursive: true })
    const old = '2020-01-01'
    const recent = new Date().toISOString().slice(0, 10)
    await fs.writeFile(path.join(activityDir, `${old}.jsonl`), '{"id":"x","type":"note.created","timestamp":"2020-01-01T00:00:00.000Z","lastModified":"2020-01-01T00:00:00.000Z","path":"X.md","user":"a"}\n')
    await fs.writeFile(path.join(activityDir, `${recent}.jsonl`), '{"id":"y","type":"note.created","timestamp":"2026-10-10T00:00:00.000Z","lastModified":"2026-10-10T00:00:00.000Z","path":"Y.md","user":"a"}\n')

    const purged = await store.purgeExpired(VAULT_ID, 90)
    expect(purged).toBe(1)
    const remaining = await fs.readdir(activityDir)
    expect(remaining).toContain(`${recent}.jsonl`)
    expect(remaining).not.toContain(`${old}.jsonl`)
  })

  it('purges nothing for retentionDays <= 0', async () => {
    await store.record(VAULT_ID, { type: 'note.created', path: 'A.md', user: 'andreas' })
    expect(await store.purgeExpired(VAULT_ID, 0)).toBe(0)
    expect(await readAll()).toHaveLength(1)
  })

  // ─── R1.6: record never throws on I/O failure ──────────────────────────────

  it('swallows a record failure instead of throwing (R1.6)', async () => {
    // Resolver points at a path whose parent is a FILE, so mkdir fails.
    const blockingFile = path.join(tmpDir, 'blocker')
    await fs.writeFile(blockingFile, 'x')
    const brokenStore = new ActivityStore(() => blockingFile, logger)
    await expect(
      brokenStore.record(VAULT_ID, { type: 'note.created', path: 'A.md', user: 'andreas' }),
    ).resolves.toBeUndefined()
  })
})
