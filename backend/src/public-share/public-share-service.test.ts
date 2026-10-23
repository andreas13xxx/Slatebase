import { describe, expect, it } from 'vitest'
import {
  PublicShareConflictError,
  PublicShareNotFoundError,
  PublicSharePasswordRequiredError,
  PublicShareValidationError,
} from './errors.js'
import { createPublicShareService, hashToken } from './public-share-service.js'
import { createMockStore, createMockVaultAccess } from './test-helpers.js'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

function setup(files: Record<string, string | Buffer> = { 'Note.md': '---\nsecret: 1\n---\n# Hi\n![[pic.png]]', 'pic.png': PNG }) {
  const clock = { time: new Date('2026-10-23T12:00:00.000Z') }
  const vault = createMockVaultAccess(files)
  const store = createMockStore()
  let counter = 0
  const service = createPublicShareService({
    store,
    vault,
    now: () => clock.time,
    generateToken: () => `token-${++counter}-abcd`,
  })
  return { service, store, vault, clock, files }
}

const input = { vaultId: 'v1', filePath: 'Note.md', createdBy: 'u1' }

describe('create', () => {
  it('returns the plaintext token once and stores only its hash', async () => {
    const { service, store } = setup()
    const { share, token } = await service.create(input)
    expect(token).toBe('token-1-abcd')
    expect(share.tokenHash).toBe(hashToken(token))
    expect(share.tokenHint).toBe('abcd')
    expect(JSON.stringify(store.shares)).not.toContain(token)
  })

  it('generates tokens with at least 128 bits by default', async () => {
    const vault = createMockVaultAccess({ 'Note.md': 'x' })
    const service = createPublicShareService({ store: createMockStore(), vault })
    const { token } = await service.create(input)
    expect(Buffer.from(token, 'base64url').length).toBeGreaterThanOrEqual(16)
  })

  it('allows only one live link per note', async () => {
    const { service } = setup()
    await service.create(input)
    await expect(service.create(input)).rejects.toBeInstanceOf(PublicShareConflictError)
  })

  it('allows a new link after the old one expired or was revoked', async () => {
    const { service, clock } = setup()
    const first = await service.create({ ...input, expiresAt: '2026-10-24T00:00:00.000Z' })
    clock.time = new Date('2026-10-25T00:00:00.000Z')
    await expect(service.create(input)).resolves.toBeDefined()
    expect(await service.revoke(first.share.id)).toBe(false)
  })

  it.each([
    ['../secret.md'],
    ['.obsidian/app.md'],
    ['dir/.hidden/x.md'],
    ['image.png'],
    [''],
    ['a//b.md'],
    ['/abs/../x.md'],
  ])('rejects the path %j', async (filePath) => {
    const { service } = setup()
    await expect(service.create({ ...input, filePath })).rejects.toBeInstanceOf(PublicShareValidationError)
  })

  it('rejects a note that does not exist', async () => {
    const { service } = setup()
    await expect(service.create({ ...input, filePath: 'Missing.md' })).rejects.toBeInstanceOf(PublicShareValidationError)
  })

  it('rejects an expiry in the past or invalid', async () => {
    const { service } = setup()
    await expect(service.create({ ...input, expiresAt: '2026-10-01T00:00:00.000Z' })).rejects.toBeInstanceOf(PublicShareValidationError)
    await expect(service.create({ ...input, expiresAt: 'tomorrow' })).rejects.toBeInstanceOf(PublicShareValidationError)
  })

  it('rejects a too short password and stores only a hash', async () => {
    const { service, store } = setup()
    await expect(service.create({ ...input, password: 'short' })).rejects.toBeInstanceOf(PublicShareValidationError)
    await service.create({ ...input, password: 'long-enough-password' })
    expect(store.shares[0]!.passwordHash).toBeDefined()
    expect(JSON.stringify(store.shares)).not.toContain('long-enough-password')
  })
})

describe('summaries', () => {
  it('never expose hashes', async () => {
    const { service } = setup()
    await service.create({ ...input, password: 'long-enough-password' })
    const [summary] = await service.listForVault('v1')
    expect(summary).toMatchObject({ vaultId: 'v1', filePath: 'Note.md', passwordProtected: true })
    expect(summary).not.toHaveProperty('tokenHash')
    expect(summary).not.toHaveProperty('passwordHash')
    expect(await service.listForUser('u1')).toHaveLength(1)
    expect(await service.listForUser('other')).toHaveLength(0)
    expect(await service.listForVault('other')).toHaveLength(0)
  })
})

describe('getNote', () => {
  it('returns the live note without frontmatter and its embeds', async () => {
    const { service } = setup()
    const { token } = await service.create(input)
    const view = await service.getNote(token)
    expect(view.title).toBe('Note')
    expect(view.markdown).toBe('# Hi\n![[pic.png]]')
    expect(view.embeds['pic.png']).toEqual({ kind: 'asset', contentType: 'image/png' })
    expect(JSON.stringify(view)).not.toContain('secret')
  })

  it('shows changes made after sharing (live state)', async () => {
    const { service, files } = setup()
    const { token } = await service.create(input)
    files['Note.md'] = 'new text'
    expect((await service.getNote(token)).markdown).toBe('new text')
  })

  it('treats unknown, expired and revoked tokens alike', async () => {
    const { service, clock } = setup()
    const { share, token } = await service.create({ ...input, expiresAt: '2026-10-24T00:00:00.000Z' })
    await expect(service.getNote('nope')).rejects.toBeInstanceOf(PublicShareNotFoundError)
    clock.time = new Date('2026-10-25T00:00:00.000Z')
    await expect(service.getNote(token)).rejects.toBeInstanceOf(PublicShareNotFoundError)
    clock.time = new Date('2026-10-23T12:00:00.000Z')
    await service.revoke(share.id)
    await expect(service.getNote(token)).rejects.toBeInstanceOf(PublicShareNotFoundError)
  })

  it('returns not found when the note is gone', async () => {
    const { service, files } = setup()
    const { token } = await service.create(input)
    delete files['Note.md']
    await expect(service.getNote(token)).rejects.toBeInstanceOf(PublicShareNotFoundError)
  })

  it('requires the password and accepts it, or an earlier unlock', async () => {
    const { service } = setup()
    const { token } = await service.create({ ...input, password: 'long-enough-password' })
    expect(await service.requiresPassword(token)).toBe(true)
    await expect(service.getNote(token)).rejects.toBeInstanceOf(PublicSharePasswordRequiredError)
    await expect(service.getNote(token, { password: 'wrong-password-1' })).rejects.toBeInstanceOf(PublicSharePasswordRequiredError)
    await expect(service.getNote(token, { password: 'long-enough-password' })).resolves.toBeDefined()
    await expect(service.getNote(token, { unlocked: true })).resolves.toBeDefined()
  })

  it('does not reveal a password requirement for unknown tokens', async () => {
    const { service } = setup()
    expect(await service.requiresPassword('nope')).toBe(false)
    expect(await service.verifyPassword('nope', 'whatever-password')).toBe(false)
  })

  it('binds the unlock to the current password', async () => {
    const { service } = setup()
    const { share, token } = await service.create({ ...input, password: 'long-enough-password' })
    const first = await service.passwordBinding(token)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(await service.passwordBinding(token)).toBe(first)
    await service.update(share.id, { password: 'another-long-password' })
    expect(await service.passwordBinding(token)).not.toBe(first)
    await service.update(share.id, { password: null })
    expect(await service.passwordBinding(token)).toBeNull()
    expect(await service.passwordBinding('nope')).toBeNull()
  })

  it('verifies passwords', async () => {
    const { service } = setup()
    const { token } = await service.create({ ...input, password: 'long-enough-password' })
    expect(await service.verifyPassword(token, 'long-enough-password')).toBe(true)
    expect(await service.verifyPassword(token, 'wrong-password-1')).toBe(false)
  })

  it('records the last access, at most once per minute', async () => {
    const { service, store, clock } = setup()
    const { token } = await service.create(input)
    await service.getNote(token)
    await new Promise((r) => setTimeout(r, 0))
    const first = store.shares[0]!.lastAccessAt
    expect(first).toBe('2026-10-23T12:00:00.000Z')
    clock.time = new Date('2026-10-23T12:00:30.000Z')
    await service.getNote(token)
    await new Promise((r) => setTimeout(r, 0))
    expect(store.shares[0]!.lastAccessAt).toBe(first)
  })
})

describe('getAsset', () => {
  it('serves an embedded asset by its reference', async () => {
    const { service } = setup()
    const { token } = await service.create(input)
    const asset = await service.getAsset(token, 'pic.png')
    expect(asset.contentType).toBe('image/png')
    expect(asset.data).toEqual(PNG)
  })

  it('serves assets embedded by embedded notes', async () => {
    const { service } = setup({ 'Note.md': '![[Inner]]', 'Inner.md': '![[deep.png]]', 'deep.png': PNG })
    const { token } = await service.create(input)
    await expect(service.getAsset(token, 'deep.png')).resolves.toBeDefined()
  })

  it('refuses anything the note does not embed', async () => {
    const { service } = setup({ 'Note.md': '![[pic.png]]', 'pic.png': PNG, 'other.png': PNG, '.slatebase/x.png': PNG, 'Secret.md': 'secret' })
    const { token } = await service.create(input)
    for (const ref of ['other.png', '../other.png', '.slatebase/x.png', 'Secret.md', '__proto__', 'constructor', '']) {
      await expect(service.getAsset(token, ref)).rejects.toBeInstanceOf(PublicShareNotFoundError)
    }
  })

  it('refuses a note embed as an asset', async () => {
    const { service } = setup({ 'Note.md': '![[Inner]]', 'Inner.md': 'x' })
    const { token } = await service.create(input)
    await expect(service.getAsset(token, 'Inner')).rejects.toBeInstanceOf(PublicShareNotFoundError)
  })

  it('enforces expiry and password like the note itself', async () => {
    const { service } = setup()
    const { token } = await service.create({ ...input, password: 'long-enough-password' })
    await expect(service.getAsset(token, 'pic.png')).rejects.toBeInstanceOf(PublicSharePasswordRequiredError)
    await expect(service.getAsset('nope', 'pic.png')).rejects.toBeInstanceOf(PublicShareNotFoundError)
  })
})

describe('update and revoke', () => {
  it('sets, changes and removes expiry and password', async () => {
    const { service, store } = setup()
    const { share } = await service.create(input)
    let summary = await service.update(share.id, { expiresAt: '2026-11-01T00:00:00.000Z', password: 'long-enough-password' })
    expect(summary.passwordProtected).toBe(true)
    expect(summary.expiresAt).toBe('2026-11-01T00:00:00.000Z')

    summary = await service.update(share.id, {})
    expect(summary.passwordProtected).toBe(true)
    expect(summary.expiresAt).toBe('2026-11-01T00:00:00.000Z')

    summary = await service.update(share.id, { expiresAt: null, password: null })
    expect(summary.passwordProtected).toBe(false)
    expect(summary.expiresAt).toBeUndefined()
    expect(store.shares[0]).not.toHaveProperty('passwordHash')
  })

  it('throws for an unknown ID', async () => {
    const { service } = setup()
    await expect(service.update('nope', {})).rejects.toBeInstanceOf(PublicShareNotFoundError)
    expect(await service.revoke('nope')).toBe(false)
  })

  it('takes effect immediately on revoke', async () => {
    const { service } = setup()
    const { share, token } = await service.create(input)
    expect(await service.revoke(share.id)).toBe(true)
    await expect(service.getNote(token)).rejects.toBeInstanceOf(PublicShareNotFoundError)
  })
})

describe('previewEmbeds', () => {
  it('lists what a link would include, without creating one', async () => {
    const { service, store } = setup({ 'Note.md': '![[Inner]] ![[pic.png]] ![[Gone]]', 'Inner.md': 'x', 'pic.png': PNG })
    const preview = await service.previewEmbeds('v1', 'Note.md')
    expect(preview).toEqual([
      { ref: 'Inner', kind: 'note' },
      { ref: 'pic.png', kind: 'asset' },
      { ref: 'Gone', kind: 'unavailable' },
    ])
    expect(store.shares).toHaveLength(0)
  })

  it('rejects hidden and unknown notes', async () => {
    const { service } = setup()
    await expect(service.previewEmbeds('v1', '.obsidian/x.md')).rejects.toBeInstanceOf(PublicShareValidationError)
    await expect(service.previewEmbeds('v1', 'Missing.md')).rejects.toBeInstanceOf(PublicShareValidationError)
  })
})

describe('vault hooks', () => {
  async function shared(paths: string[]) {
    const files: Record<string, string> = {}
    for (const p of paths) files[p] = 'x'
    const { service, store } = setup(files)
    for (const p of paths) await service.create({ ...input, filePath: p })
    return { service, store }
  }

  it('follows a renamed file', async () => {
    const { service, store } = await shared(['A.md'])
    await service.onFileRenamed('v1', 'A.md', 'B.md')
    expect(store.shares[0]!.filePath).toBe('B.md')
  })

  it('follows a moved folder by prefix and leaves similar names alone', async () => {
    const { service, store } = await shared(['dir/A.md', 'dir2/B.md', 'dir/sub/C.md'])
    await service.onFileRenamed('v1', 'dir', 'moved/dir')
    expect(store.shares.map((s) => s.filePath).sort()).toEqual(['dir2/B.md', 'moved/dir/A.md', 'moved/dir/sub/C.md'])
  })

  it('ignores other vaults', async () => {
    const { service, store } = await shared(['A.md'])
    await service.onFileRenamed('other', 'A.md', 'B.md')
    await service.onFileDeleted('other', 'A.md')
    expect(store.shares.map((s) => s.filePath)).toEqual(['A.md'])
  })

  it('removes links of a deleted file or folder', async () => {
    const { service, store } = await shared(['dir/A.md', 'dir2/B.md', 'C.md'])
    await service.onFileDeleted('v1', 'dir')
    expect(store.shares.map((s) => s.filePath).sort()).toEqual(['C.md', 'dir2/B.md'])
    await service.onFileDeleted('v1', 'C.md')
    expect(store.shares.map((s) => s.filePath)).toEqual(['dir2/B.md'])
  })

  it('keeps the token valid after a rename', async () => {
    const { service, files } = setup({ 'A.md': 'one' })
    const { token } = await service.create({ ...input, filePath: 'A.md' })
    files['B.md'] = files['A.md']!
    delete files['A.md']
    await service.onFileRenamed('v1', 'A.md', 'B.md')
    expect((await service.getNote(token)).title).toBe('B')
  })
})
