import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { isBinaryContent, validateFilePath, PathTraversalError, VaultReader, computeEtag } from './index'

describe('isBinaryContent', () => {
  it('returns false for a pure text buffer', () => {
    const buffer = Buffer.from('Hello, world!')
    expect(isBinaryContent(buffer)).toBe(false)
  })

  it('returns true when null byte at position 0', () => {
    const buffer = Buffer.alloc(100)
    buffer[0] = 0
    expect(isBinaryContent(buffer)).toBe(true)
  })

  it('returns true when null byte at position 8191', () => {
    const buffer = Buffer.alloc(9000, 0x41)
    buffer[8191] = 0
    expect(isBinaryContent(buffer)).toBe(true)
  })

  it('returns false when null byte at position 8192', () => {
    const buffer = Buffer.alloc(9000, 0x41)
    buffer[8192] = 0
    expect(isBinaryContent(buffer)).toBe(false)
  })

  it('returns false for empty buffer', () => {
    const buffer = Buffer.alloc(0)
    expect(isBinaryContent(buffer)).toBe(false)
  })
})

describe('computeEtag', () => {
  it('returns a 16-character hex string', () => {
    const buffer = Buffer.from('Hello, world!')
    const etag = computeEtag(buffer)
    expect(etag).toHaveLength(16)
    expect(etag).toMatch(/^[0-9a-f]{16}$/)
  })

  it('returns the same etag for the same content', () => {
    const buffer1 = Buffer.from('Same content')
    const buffer2 = Buffer.from('Same content')
    expect(computeEtag(buffer1)).toBe(computeEtag(buffer2))
  })

  it('returns different etags for different content', () => {
    const buffer1 = Buffer.from('Content A')
    const buffer2 = Buffer.from('Content B')
    expect(computeEtag(buffer1)).not.toBe(computeEtag(buffer2))
  })

  it('handles empty buffer', () => {
    const buffer = Buffer.alloc(0)
    const etag = computeEtag(buffer)
    expect(etag).toHaveLength(16)
    expect(etag).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('validateFilePath', () => {
  const vaultRoot = path.resolve('/vault/root')

  it('resolves a valid relative path', () => {
    const result = validateFilePath(vaultRoot, 'notes/hello.md')
    expect(result).toBe(path.join(vaultRoot, 'notes', 'hello.md'))
  })

  it('throws PathTraversalError for ../ traversal', () => {
    expect(() => validateFilePath(vaultRoot, '../etc/passwd')).toThrow(PathTraversalError)
  })

  it('throws PathTraversalError for absolute path', () => {
    expect(() => validateFilePath(vaultRoot, '/etc/passwd')).toThrow(PathTraversalError)
  })

  it('throws PathTraversalError for null byte in path', () => {
    expect(() => validateFilePath(vaultRoot, 'notes/file\x00.md')).toThrow(PathTraversalError)
  })

  it('throws PathTraversalError when path resolves to vault root', () => {
    expect(() => validateFilePath(vaultRoot, '.')).toThrow(PathTraversalError)
  })

  it('handles URL-encoded spaces', () => {
    const result = validateFilePath(vaultRoot, 'Meine%20Notizen/hello.md')
    expect(result).toBe(path.join(vaultRoot, 'Meine Notizen', 'hello.md'))
  })
})

describe('VaultReader', () => {
  let fixtureDir: string
  const reader = new VaultReader()

  beforeAll(async () => {
    // Create a temporary fixture vault structure:
    // fixture/
    //   Alpha/
    //     nested.md (content: "nested")
    //   beta/
    //     deep/
    //       deep-file.md (content: "deep")
    //   file-a.md (content: "Hello World")
    //   File-B.txt (content: "Ümlauts: äöü ß")
    //   binary.bin (binary content with null bytes)
    fixtureDir = path.join(os.tmpdir(), `slatebase-test-${Date.now()}`)
    await fs.mkdir(fixtureDir, { recursive: true })
    await fs.mkdir(path.join(fixtureDir, 'Alpha'), { recursive: true })
    await fs.mkdir(path.join(fixtureDir, 'beta', 'deep'), { recursive: true })

    await fs.writeFile(path.join(fixtureDir, 'Alpha', 'nested.md'), 'nested')
    await fs.writeFile(path.join(fixtureDir, 'beta', 'deep', 'deep-file.md'), 'deep')
    await fs.writeFile(path.join(fixtureDir, 'file-a.md'), 'Hello World')
    await fs.writeFile(path.join(fixtureDir, 'File-B.txt'), 'Ümlauts: äöü ß')

    // Binary file with null bytes
    const binaryBuf = Buffer.alloc(100)
    binaryBuf[10] = 0 // null byte
    binaryBuf.write('HEADER', 0)
    await fs.writeFile(path.join(fixtureDir, 'binary.bin'), binaryBuf)
  })

  afterAll(async () => {
    await fs.rm(fixtureDir, { recursive: true, force: true })
  })

  describe('readDirectory', () => {
    it('returns directories before files, sorted case-insensitive', async () => {
      const tree = await reader.readDirectory(fixtureDir, 50)

      expect(tree.type).toBe('directory')
      expect(tree.children).toBeDefined()
      const childNames = tree.children!.map(c => c.name)

      // Directories first (Alpha, beta), then files (binary.bin, file-a.md, File-B.txt)
      expect(childNames[0]).toBe('Alpha')
      expect(childNames[1]).toBe('beta')
      // Files sorted case-insensitive: binary.bin, file-a.md, File-B.txt
      expect(childNames[2]).toBe('binary.bin')
      expect(childNames[3]).toBe('file-a.md')
      expect(childNames[4]).toBe('File-B.txt')
    })

    it('populates itemCount for directories', async () => {
      const tree = await reader.readDirectory(fixtureDir, 50)

      // Root has 2 dirs + 3 files = 5 items
      expect(tree.itemCount).toBe(5)

      // Alpha has 1 file
      const alpha = tree.children!.find(c => c.name === 'Alpha')!
      expect(alpha.itemCount).toBe(1)

      // beta has 1 dir (deep)
      const beta = tree.children!.find(c => c.name === 'beta')!
      expect(beta.itemCount).toBe(1)
    })

    it('populates size for files', async () => {
      const tree = await reader.readDirectory(fixtureDir, 50)

      const fileA = tree.children!.find(c => c.name === 'file-a.md')!
      expect(fileA.size).toBe(Buffer.byteLength('Hello World', 'utf-8'))
      expect(fileA.type).toBe('file')
    })

    it('uses relative paths from vault root', async () => {
      const tree = await reader.readDirectory(fixtureDir, 50)

      // Root path should be empty string
      expect(tree.path).toBe('')

      const alpha = tree.children!.find(c => c.name === 'Alpha')!
      expect(alpha.path).toBe('Alpha')

      // Nested file
      const nestedFile = alpha.children!.find(c => c.name === 'nested.md')!
      expect(nestedFile.path).toBe(path.join('Alpha', 'nested.md'))
    })

    it('stops recursion at maxDepth', async () => {
      // maxDepth=1: root can list children, but subdirectories don't recurse
      const tree = await reader.readDirectory(fixtureDir, 1)

      expect(tree.children).toBeDefined()
      expect(tree.children!.length).toBe(5)

      // Alpha directory should have itemCount but no children array (depth limit reached)
      const alpha = tree.children!.find(c => c.name === 'Alpha')!
      expect(alpha.type).toBe('directory')
      expect(alpha.itemCount).toBe(1)
      expect(alpha.children).toBeUndefined()
    })

    it('maxDepth=0 returns root with itemCount but no children', async () => {
      const tree = await reader.readDirectory(fixtureDir, 0)

      expect(tree.type).toBe('directory')
      expect(tree.itemCount).toBe(5)
      expect(tree.children).toBeUndefined()
    })

    it('recurses into nested directories', async () => {
      const tree = await reader.readDirectory(fixtureDir, 50)

      const beta = tree.children!.find(c => c.name === 'beta')!
      expect(beta.children).toBeDefined()

      const deep = beta.children!.find(c => c.name === 'deep')!
      expect(deep.type).toBe('directory')
      expect(deep.children).toBeDefined()
      expect(deep.children![0]!.name).toBe('deep-file.md')
    })
  })

  describe('readFile', () => {
    it('returns full content for file under maxSize limit', async () => {
      const filePath = path.join(fixtureDir, 'file-a.md')
      const result = await reader.readFile(filePath, 1024)

      expect(result.content).toBe('Hello World')
      expect(result.name).toBe('file-a.md')
      expect(result.size).toBe(Buffer.byteLength('Hello World', 'utf-8'))
      expect(result.encoding).toBe('utf-8')
      expect(result.isBinary).toBe(false)
      expect(result.isTruncated).toBe(false)
    })

    it('sets isTruncated=true and returns first maxSize bytes for oversized file', async () => {
      const filePath = path.join(fixtureDir, 'file-a.md')
      // maxSize=5 is less than "Hello World" (11 bytes)
      const result = await reader.readFile(filePath, 5)

      expect(result.isTruncated).toBe(true)
      expect(result.content).toBe('Hello')
      expect(result.size).toBe(11) // Original size
    })

    it('sets isBinary=true and empty content for binary file', async () => {
      const filePath = path.join(fixtureDir, 'binary.bin')
      const result = await reader.readFile(filePath, 1024)

      expect(result.isBinary).toBe(true)
      expect(result.content).toBe('')
      expect(result.size).toBe(100)
    })

    it('preserves UTF-8 special characters and Umlauts', async () => {
      const filePath = path.join(fixtureDir, 'File-B.txt')
      const result = await reader.readFile(filePath, 1024)

      expect(result.content).toBe('Ümlauts: äöü ß')
      expect(result.isBinary).toBe(false)
    })

    it('includes etag computed from file content', async () => {
      const filePath = path.join(fixtureDir, 'file-a.md')
      const result = await reader.readFile(filePath, 1024)

      expect(result.etag).toBeDefined()
      expect(result.etag).toHaveLength(16)
      expect(result.etag).toMatch(/^[0-9a-f]{16}$/)

      // Verify etag matches expected hash of file content
      const expectedEtag = computeEtag(Buffer.from('Hello World', 'utf-8'))
      expect(result.etag).toBe(expectedEtag)
    })

    it('returns consistent etag for same file content', async () => {
      const filePath = path.join(fixtureDir, 'file-a.md')
      const result1 = await reader.readFile(filePath, 1024)
      const result2 = await reader.readFile(filePath, 1024)

      expect(result1.etag).toBe(result2.etag)
    })
  })
})

import { VaultManager, generateVaultId } from './index'
import type { IVaultReader, DirectoryTree, FileContent } from './index'
import type { ILogger } from '../logger/index'

// --- Test Helpers ---

function createMockLogger(): ILogger & { messages: { level: string; message: string; meta?: object | undefined }[] } {
  const messages: { level: string; message: string; meta?: object | undefined }[] = []
  return {
    messages,
    debug(message: string, meta?: object) { messages.push({ level: 'debug', message, meta }) },
    info(message: string, meta?: object) { messages.push({ level: 'info', message, meta }) },
    warn(message: string, meta?: object) { messages.push({ level: 'warn', message, meta }) },
    error(message: string, meta?: object) { messages.push({ level: 'error', message, meta }) },
  }
}

function createMockVaultReader(trees: Map<string, DirectoryTree> = new Map()): IVaultReader {
  return {
    async readDirectory(absolutePath: string, _maxDepth: number): Promise<DirectoryTree> {
      const tree = trees.get(absolutePath)
      if (tree) return tree
      return {
        name: path.basename(absolutePath),
        type: 'directory',
        path: '',
        children: [],
        itemCount: 0,
      }
    },
    async readFile(_absolutePath: string, _maxSize: number): Promise<FileContent> {
      return {
        path: '',
        name: '',
        content: '',
        size: 0,
        encoding: 'utf-8',
        isBinary: false,
        isTruncated: false,
        etag: '0000000000000000',
      }
    },
  }
}

describe('VaultManager', () => {
  let tempVaultDir: string
  let tempVaultDir2: string

  beforeAll(async () => {
    // Create temporary directories to simulate vault paths
    tempVaultDir = path.join(os.tmpdir(), `slatebase-vm-test-${Date.now()}-a`)
    tempVaultDir2 = path.join(os.tmpdir(), `slatebase-vm-test-${Date.now()}-b`)
    await fs.mkdir(tempVaultDir, { recursive: true })
    await fs.mkdir(tempVaultDir2, { recursive: true })
  })

  afterAll(async () => {
    await fs.rm(tempVaultDir, { recursive: true, force: true })
    await fs.rm(tempVaultDir2, { recursive: true, force: true })
  })

  describe('loadVaults', () => {
    it('logs a warning when no vaults are configured', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      await manager.loadVaults([])

      expect(logger.messages).toContainEqual(
        expect.objectContaining({ level: 'warn', message: 'No vaults configured' })
      )
      expect(manager.getAllVaults()).toHaveLength(0)
    })

    it('loads a vault successfully from a valid path', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      await manager.loadVaults([{ path: tempVaultDir }])

      const vaults = manager.getAllVaults()
      expect(vaults).toHaveLength(1)
      expect(vaults[0]!.info.status).toBe('loaded')
      expect(vaults[0]!.info.path).toBe(path.resolve(tempVaultDir))
    })

    it('generates a stable vault ID from the absolute path', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      await manager.loadVaults([{ path: tempVaultDir }])

      const vaults = manager.getAllVaults()
      const expectedId = generateVaultId(path.resolve(tempVaultDir))
      expect(vaults[0]!.info.id).toBe(expectedId)
    })

    it('uses directory basename as vault name when no name override provided', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      await manager.loadVaults([{ path: tempVaultDir }])

      const vaults = manager.getAllVaults()
      expect(vaults[0]!.info.name).toBe(path.basename(tempVaultDir))
    })

    it('uses config.name as vault name when provided', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      await manager.loadVaults([{ path: tempVaultDir, name: 'My Vault' }])

      const vaults = manager.getAllVaults()
      expect(vaults[0]!.info.name).toBe('My Vault')
    })

    it('deduplicates vault names with numeric suffix', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      // Both vaults get the same name override
      await manager.loadVaults([
        { path: tempVaultDir, name: 'Notes' },
        { path: tempVaultDir2, name: 'Notes' },
      ])

      const vaults = manager.getAllVaults()
      expect(vaults).toHaveLength(2)
      const names = vaults.map(v => v.info.name).sort()
      expect(names).toContain('Notes')
      expect(names).toContain('Notes-2')
    })

    it('skips vaults with non-existent paths (graceful degradation)', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      await manager.loadVaults([
        { path: '/non/existent/path/that/does/not/exist' },
        { path: tempVaultDir },
      ])

      const vaults = manager.getAllVaults()
      expect(vaults).toHaveLength(1)
      expect(vaults[0]!.info.path).toBe(path.resolve(tempVaultDir))

      // Should have logged an error for the failed vault
      const errorLogs = logger.messages.filter(m => m.level === 'error')
      expect(errorLogs).toHaveLength(1)
    })

    it('logs info for each successfully loaded vault', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      await manager.loadVaults([{ path: tempVaultDir }])

      const infoLogs = logger.messages.filter(m => m.level === 'info')
      expect(infoLogs).toHaveLength(1)
      expect(infoLogs[0]!.message).toBe('Vault loaded')
    })

    it('passes maxDepth to vaultReader.readDirectory', async () => {
      const logger = createMockLogger()
      let capturedMaxDepth: number | undefined
      const reader: IVaultReader = {
        async readDirectory(_absolutePath: string, maxDepth: number): Promise<DirectoryTree> {
          capturedMaxDepth = maxDepth
          return { name: 'test', type: 'directory', path: '', children: [], itemCount: 0 }
        },
        async readFile(): Promise<FileContent> {
          return { path: '', name: '', content: '', size: 0, encoding: 'utf-8', isBinary: false, isTruncated: false, etag: '0000000000000000' }
        },
      }
      const manager = new VaultManager(reader, logger, 25)

      await manager.loadVaults([{ path: tempVaultDir }])

      expect(capturedMaxDepth).toBe(25)
    })
  })

  describe('getVault', () => {
    it('returns vault by ID', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      await manager.loadVaults([{ path: tempVaultDir }])

      const expectedId = generateVaultId(path.resolve(tempVaultDir))
      const vault = manager.getVault(expectedId)
      expect(vault).not.toBeNull()
      expect(vault!.info.id).toBe(expectedId)
    })

    it('returns null for unknown vault ID', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      await manager.loadVaults([{ path: tempVaultDir }])

      const vault = manager.getVault('nonexistent123')
      expect(vault).toBeNull()
    })
  })

  describe('getAllVaults', () => {
    it('returns empty array when no vaults loaded', () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      expect(manager.getAllVaults()).toEqual([])
    })

    it('returns all loaded vaults', async () => {
      const logger = createMockLogger()
      const reader = createMockVaultReader()
      const manager = new VaultManager(reader, logger, 50)

      await manager.loadVaults([
        { path: tempVaultDir },
        { path: tempVaultDir2 },
      ])

      expect(manager.getAllVaults()).toHaveLength(2)
    })
  })
})
