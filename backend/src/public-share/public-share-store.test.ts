import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPublicShareStore } from './public-share-store.js'
import type { PublicShare } from './types.js'

const share = (id: string): PublicShare => ({
  id, tokenHash: `hash-${id}`, tokenHint: 'abcd', vaultId: 'v1', filePath: `${id}.md`, createdBy: 'u1', createdAt: '2026-10-23T12:00:00.000Z',
})

let dir: string
let file: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'public-share-store-'))
  file = path.join(dir, 'public-shares.json')
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('createPublicShareStore', () => {
  it('starts empty when the file does not exist', async () => {
    expect(await createPublicShareStore(file).list()).toEqual([])
  })

  it('persists mutations across instances', async () => {
    await createPublicShareStore(file).mutate((all) => [...all, share('a')])
    expect(await createPublicShareStore(file).list()).toEqual([share('a')])
  })

  it('does not lose concurrent mutations', async () => {
    const store = createPublicShareStore(file)
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => store.mutate((all) => [...all, share(id)])))
    expect((await store.list()).map((s) => s.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('falls back to empty for malformed content and drops malformed records', async () => {
    await fs.writeFile(file, '{"shares": "nope"}')
    expect(await createPublicShareStore(file).list()).toEqual([])
    await fs.writeFile(file, JSON.stringify({ shares: [share('ok'), { id: 'bad' }, null] }))
    expect((await createPublicShareStore(file).list()).map((s) => s.id)).toEqual(['ok'])
  })

  it.skipIf(process.platform === 'win32')('writes the file with owner-only permissions', async () => {
    await createPublicShareStore(file).mutate((all) => [...all, share('a')])
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600)
  })
})
