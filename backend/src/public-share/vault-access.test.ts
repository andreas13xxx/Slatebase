import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ILogger } from '../logger/index.js'
import { VaultReader, validateFilePath } from '../vault/index.js'
import { createPublicShareVaultAccess } from './vault-access.js'

const logger: ILogger = { debug() {}, info() {}, warn() {}, error() {} }

let base: string
let root: string
let outside: string

beforeEach(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), 'public-share-access-'))
  root = path.join(base, 'vault')
  outside = path.join(base, 'outside')
  await fs.mkdir(path.join(root, 'sub'), { recursive: true })
  await fs.mkdir(outside)
  await fs.writeFile(path.join(root, 'Note.md'), '# Hi')
  await fs.writeFile(path.join(root, 'pic.png'), Buffer.from([1, 2, 3]))
  await fs.writeFile(path.join(root, 'bin.md'), Buffer.from([0, 1, 2]))
  await fs.writeFile(path.join(outside, 'secret.png'), 'secret')
  await fs.writeFile(path.join(outside, 'secret.md'), 'secret note')
})

afterEach(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

function createAccess(maxFileSize = 1024) {
  const reader = new VaultReader(logger)
  return createPublicShareVaultAccess({
    vaultService: {
      getVaultTree: (vaultId) => {
        if (vaultId !== 'v1') throw new Error('unknown vault')
        return reader.readDirectory(root, 10)
      },
      getFileContent: async (vaultId, filePath) => {
        const file = await reader.readFile(validateFilePath(root, filePath), maxFileSize, { vaultId, rootPath: root })
        file.path = filePath
        return file
      },
      resolveFilePath: (_vaultId, filePath) => validateFilePath(root, filePath),
    },
    getVaultRoot: (vaultId) => (vaultId === 'v1' ? root : null),
    logger,
  })
}

describe('createPublicShareVaultAccess', () => {
  it('reads the tree, text and binary files', async () => {
    const access = createAccess()
    expect((await access.getTree('v1'))?.children?.map((c) => c.name).sort()).toEqual(['Note.md', 'bin.md', 'pic.png', 'sub'])
    expect(await access.readText('v1', 'Note.md')).toBe('# Hi')
    expect(await access.readBinary('v1', 'pic.png')).toEqual(Buffer.from([1, 2, 3]))
  })

  it('returns null for unknown vaults and missing files', async () => {
    const access = createAccess()
    expect(await access.getTree('nope')).toBeNull()
    expect(await access.readText('v1', 'Missing.md')).toBeNull()
    expect(await access.readBinary('v1', 'missing.png')).toBeNull()
    expect(await access.readBinary('nope', 'pic.png')).toBeNull()
  })

  it('returns null for binary content and truncated notes as text', async () => {
    expect(await createAccess().readText('v1', 'bin.md')).toBeNull()
    expect(await createAccess(2).readText('v1', 'Note.md')).toBeNull()
  })

  it('refuses path traversal', async () => {
    const access = createAccess()
    expect(await access.readText('v1', '../outside/secret.md')).toBeNull()
    expect(await access.readBinary('v1', '../outside/secret.png')).toBeNull()
    expect(await access.readBinary('v1', '/etc/passwd')).toBeNull()
  })

  it.skipIf(process.platform === 'win32')('refuses symlinks that leave the vault', async () => {
    await fs.symlink(path.join(outside, 'secret.png'), path.join(root, 'link.png'))
    await fs.symlink(path.join(outside, 'secret.md'), path.join(root, 'link.md'))
    await fs.symlink(outside, path.join(root, 'linkdir'))
    const access = createAccess()
    expect(await access.readBinary('v1', 'link.png')).toBeNull()
    expect(await access.readText('v1', 'link.md')).toBeNull()
    expect(await access.readBinary('v1', 'linkdir/secret.png')).toBeNull()
  })

  it('refuses a directory as an asset', async () => {
    expect(await createAccess().readBinary('v1', 'sub')).toBeNull()
  })
})
