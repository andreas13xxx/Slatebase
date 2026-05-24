import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'
import {
  ImportService,
  InvalidFilenameError,
  FileTooLargeError,
  FileConflictError,
  DepthExceededError,
  FileCountExceededError,
} from './index.js'
import { VaultNotFoundError } from '../business/index.js'
import type { IVaultManager, IVaultReader, Vault, DirectoryTree } from '../vault/index.js'
import type { IConfigService, ServerConfig } from '../config/index.js'
import type { ILogger } from '../logger/index.js'
import type { UploadedFile } from './index.js'

// --- Test Helpers ---

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

function createMockConfig(overrides?: Partial<ServerConfig>): IConfigService {
  const config: ServerConfig = {
    port: 3000,
    host: '127.0.0.1',
    logLevel: 'info',
    vaults: [],
    maxFileSize: 5242880,
    maxDirectoryDepth: 50,
    maxVaults: 20,
    allowedOrigins: [],
    dataDir: './data',
    maxImportFileSize: 524288000, // 500 MB
    maxImportFiles: 500,
    maxImportDepth: 10,
    ...overrides,
  }
  return {
    getServerConfig: () => config,
    getVaultConfigs: () => config.vaults,
  }
}

function createMockVaultReader(): IVaultReader {
  const emptyTree: DirectoryTree = {
    name: 'root',
    type: 'directory',
    path: '',
    children: [],
    itemCount: 0,
  }
  return {
    readDirectory: async () => emptyTree,
    readFile: async () => ({
      path: '',
      name: '',
      content: '',
      size: 0,
      encoding: 'utf-8' as const,
      isBinary: false,
      isTruncated: false,
      etag: '0000000000000000',
    }),
  }
}

function createMockVaultManager(vault: Vault | null): IVaultManager {
  const vaults = new Map<string, Vault>()
  if (vault) {
    vaults.set(vault.info.id, vault)
  }
  return {
    loadVaults: async () => {},
    getVault: (id: string) => vaults.get(id) ?? null,
    getAllVaults: () => Array.from(vaults.values()),
    addVault: (v: Vault) => { vaults.set(v.info.id, v) },
    removeVault: (id: string) => { vaults.delete(id) },
  }
}

function createUploadedFile(name: string, content: string, size?: number): UploadedFile {
  const buffer = Buffer.from(content, 'utf-8')
  const readable = new Readable({
    read() {
      this.push(buffer)
      this.push(null)
    },
  })
  // Convert Node.js Readable to Web ReadableStream
  const webStream = Readable.toWeb(readable)
  return {
    name,
    relativePath: name,
    size: size ?? buffer.length,
    stream: webStream as ReadableStream,
  }
}

function createUploadedFileWithPath(relativePath: string, content: string, size?: number): UploadedFile {
  const buffer = Buffer.from(content, 'utf-8')
  const readable = new Readable({
    read() {
      this.push(buffer)
      this.push(null)
    },
  })
  const webStream = Readable.toWeb(readable)
  const name = relativePath.split('/').pop() || relativePath
  return {
    name,
    relativePath,
    size: size ?? buffer.length,
    stream: webStream as ReadableStream,
  }
}

// --- Tests ---

describe('ImportService', () => {
  let tempDir: string
  let vaultPath: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'import-test-'))
    vaultPath = path.join(tempDir, 'vault')
    await fs.mkdir(vaultPath, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  function createTestVault(): Vault {
    return {
      info: {
        id: 'testvault123',
        name: 'Test Vault',
        path: vaultPath,
        status: 'loaded',
      },
      tree: {
        name: 'vault',
        type: 'directory',
        path: '',
        children: [],
        itemCount: 0,
      },
    }
  }

  describe('importFile', () => {
    it('should import a valid file into the vault root', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const file = createUploadedFile('hello.txt', 'Hello, World!')
      await service.importFile('testvault123', file)

      // Verify file was written
      const filePath = path.join(vaultPath, 'hello.txt')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('Hello, World!')
    })

    it('should throw VaultNotFoundError for non-existent vault', async () => {
      const vaultManager = createMockVaultManager(null)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const file = createUploadedFile('test.txt', 'content')
      await expect(service.importFile('nonexistent', file))
        .rejects.toThrow(VaultNotFoundError)
    })

    it('should throw InvalidFilenameError for empty filename', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const file = createUploadedFile('', 'content')
      await expect(service.importFile('testvault123', file))
        .rejects.toThrow(InvalidFilenameError)
    })

    it('should throw InvalidFilenameError for filename exceeding 255 chars', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const longName = 'a'.repeat(256) + '.txt'
      const file = createUploadedFile(longName, 'content')
      await expect(service.importFile('testvault123', file))
        .rejects.toThrow(InvalidFilenameError)
    })

    it('should throw InvalidFilenameError for filename with forward slash', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const file = createUploadedFile('path/file.txt', 'content')
      await expect(service.importFile('testvault123', file))
        .rejects.toThrow(InvalidFilenameError)
    })

    it('should throw InvalidFilenameError for filename with backslash', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const file = createUploadedFile('path\\file.txt', 'content')
      await expect(service.importFile('testvault123', file))
        .rejects.toThrow(InvalidFilenameError)
    })

    it('should throw FileTooLargeError when file exceeds max size', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig({ maxImportFileSize: 100 }),
        createMockLogger(),
      )

      // File reports size > 100 bytes
      const file = createUploadedFile('big.txt', 'x', 200)
      await expect(service.importFile('testvault123', file))
        .rejects.toThrow(FileTooLargeError)
    })

    it('should throw FileConflictError when file already exists', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      // Create existing file
      await fs.writeFile(path.join(vaultPath, 'existing.txt'), 'already here')

      const file = createUploadedFile('existing.txt', 'new content')
      await expect(service.importFile('testvault123', file))
        .rejects.toThrow(FileConflictError)
    })

    it('should clean up partial file on write failure', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      // Create a stream that errors mid-write
      const errorStream = new Readable({
        read() {
          this.push('partial data')
          this.destroy(new Error('Connection lost'))
        },
      })
      const webStream = Readable.toWeb(errorStream)

      const file: UploadedFile = {
        name: 'failing.txt',
        relativePath: 'failing.txt',
        size: 100,
        stream: webStream as ReadableStream,
      }

      await expect(service.importFile('testvault123', file)).rejects.toThrow()

      // Verify partial file was cleaned up
      const targetPath = path.join(vaultPath, 'failing.txt')
      await expect(fs.access(targetPath)).rejects.toThrow()
    })

    it('should accept a filename with exactly 255 characters', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const name = 'a'.repeat(251) + '.txt' // 255 chars total
      const file = createUploadedFile(name, 'content')
      await service.importFile('testvault123', file)

      const filePath = path.join(vaultPath, name)
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('content')
    })

    it('should accept a file with exactly the max size', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig({ maxImportFileSize: 10 }),
        createMockLogger(),
      )

      // File size is exactly 10 bytes (at the limit)
      const file = createUploadedFile('exact.txt', '0123456789', 10)
      await service.importFile('testvault123', file)

      const filePath = path.join(vaultPath, 'exact.txt')
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('0123456789')
    })

    it('should refresh the vault tree after successful import', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      let readDirectoryCalled = false
      const vaultReader: IVaultReader = {
        readDirectory: async () => {
          readDirectoryCalled = true
          return { name: 'vault', type: 'directory' as const, path: '', children: [], itemCount: 1 }
        },
        readFile: async () => ({
          path: '', name: '', content: '', size: 0,
          encoding: 'utf-8' as const, isBinary: false, isTruncated: false, etag: '0000000000000000',
        }),
      }

      const service = new ImportService(
        vaultManager,
        vaultReader,
        createMockConfig(),
        createMockLogger(),
      )

      const file = createUploadedFile('new.txt', 'data')
      await service.importFile('testvault123', file)

      expect(readDirectoryCalled).toBe(true)
    })
  })

  describe('importFolder', () => {
    it('should import multiple files preserving directory structure', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const files = [
        createUploadedFileWithPath('docs/readme.md', '# Readme'),
        createUploadedFileWithPath('docs/guide.md', '# Guide'),
        createUploadedFileWithPath('src/index.ts', 'export {}'),
      ]

      await service.importFolder('testvault123', files)

      // Verify files were written with correct structure
      const readme = await fs.readFile(path.join(vaultPath, 'docs/readme.md'), 'utf-8')
      expect(readme).toBe('# Readme')

      const guide = await fs.readFile(path.join(vaultPath, 'docs/guide.md'), 'utf-8')
      expect(guide).toBe('# Guide')

      const index = await fs.readFile(path.join(vaultPath, 'src/index.ts'), 'utf-8')
      expect(index).toBe('export {}')
    })

    it('should throw VaultNotFoundError for non-existent vault', async () => {
      const vaultManager = createMockVaultManager(null)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const files = [createUploadedFileWithPath('file.txt', 'content')]
      await expect(service.importFolder('nonexistent', files))
        .rejects.toThrow(VaultNotFoundError)
    })

    it('should throw FileCountExceededError when file count exceeds limit', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig({ maxImportFiles: 2 }),
        createMockLogger(),
      )

      const files = [
        createUploadedFileWithPath('a.txt', 'a'),
        createUploadedFileWithPath('b.txt', 'b'),
        createUploadedFileWithPath('c.txt', 'c'),
      ]

      await expect(service.importFolder('testvault123', files))
        .rejects.toThrow(FileCountExceededError)
    })

    it('should throw DepthExceededError when nesting exceeds max depth', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig({ maxImportDepth: 3 }),
        createMockLogger(),
      )

      // 4 levels deep: a/b/c/d/file.txt = 5 segments > 3 max depth
      const files = [
        createUploadedFileWithPath('a/b/c/d/file.txt', 'deep'),
      ]

      await expect(service.importFolder('testvault123', files))
        .rejects.toThrow(DepthExceededError)
    })

    it('should accept files at exactly the max depth', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig({ maxImportDepth: 3 }),
        createMockLogger(),
      )

      // 3 segments: a/b/file.txt = exactly 3 levels
      const files = [
        createUploadedFileWithPath('a/b/file.txt', 'ok'),
      ]

      await service.importFolder('testvault123', files)

      const content = await fs.readFile(path.join(vaultPath, 'a/b/file.txt'), 'utf-8')
      expect(content).toBe('ok')
    })

    it('should throw FileConflictError when a target file already exists', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      // Create existing file
      await fs.mkdir(path.join(vaultPath, 'docs'), { recursive: true })
      await fs.writeFile(path.join(vaultPath, 'docs/existing.md'), 'old content')

      const files = [
        createUploadedFileWithPath('docs/existing.md', 'new content'),
      ]

      await expect(service.importFolder('testvault123', files))
        .rejects.toThrow(FileConflictError)
    })

    it('should not write any files when a conflict is detected', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      // Create existing file that will conflict with the second file
      await fs.mkdir(path.join(vaultPath, 'docs'), { recursive: true })
      await fs.writeFile(path.join(vaultPath, 'docs/existing.md'), 'old content')

      const files = [
        createUploadedFileWithPath('new-file.txt', 'should not be written'),
        createUploadedFileWithPath('docs/existing.md', 'conflict'),
      ]

      await expect(service.importFolder('testvault123', files))
        .rejects.toThrow(FileConflictError)

      // Verify the non-conflicting file was NOT written
      await expect(fs.access(path.join(vaultPath, 'new-file.txt'))).rejects.toThrow()
    })

    it('should roll back created files and directories on write failure', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      // First file succeeds
      const goodFile = createUploadedFileWithPath('subdir/good.txt', 'good content')

      // Second file targets a path where we'll create a directory to block the write
      // Create a directory at the target file path so the write fails
      await fs.mkdir(path.join(vaultPath, 'subdir2'), { recursive: true })
      await fs.mkdir(path.join(vaultPath, 'subdir2/bad.txt'), { recursive: true }) // directory blocks file write

      // Create a file that targets the blocked path (unused, conflict check catches it)
      createUploadedFileWithPath('subdir2/bad.txt', 'will fail')

      // The conflict check won't catch this because it checks for file existence,
      // but writing will fail because there's a directory at that path.
      // Actually, fs.access will succeed for the directory, so conflict check will catch it.
      // Let me use a different approach: make the target path unwritable after conflict check passes.

      // Better approach: use a mock that throws during the write phase
      // We need to test the rollback logic, so let's directly test with a file that
      // causes pipeline to fail. Use a ReadableStream that errors after yielding some data.
      const errorStream = new ReadableStream({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode('partial'))
          controller.error(new Error('Disk full'))
        },
      })
      const badFile2: UploadedFile = {
        name: 'bad.txt',
        relativePath: 'otherdir/bad.txt',
        size: 100,
        stream: errorStream,
      }

      await expect(service.importFolder('testvault123', [goodFile, badFile2]))
        .rejects.toThrow('Disk full')

      // Verify rollback: good.txt should be removed
      await expect(fs.access(path.join(vaultPath, 'subdir/good.txt'))).rejects.toThrow()
      // Verify rollback: subdir should be removed
      await expect(fs.access(path.join(vaultPath, 'subdir'))).rejects.toThrow()
    })

    it('should create intermediate directories for nested files', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const files = [
        createUploadedFileWithPath('a/b/c/deep.txt', 'deep content'),
      ]

      await service.importFolder('testvault123', files)

      // Verify intermediate directories exist
      const stat = await fs.stat(path.join(vaultPath, 'a/b/c'))
      expect(stat.isDirectory()).toBe(true)

      const content = await fs.readFile(path.join(vaultPath, 'a/b/c/deep.txt'), 'utf-8')
      expect(content).toBe('deep content')
    })

    it('should import a single file at root level', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig(),
        createMockLogger(),
      )

      const files = [
        createUploadedFileWithPath('root-file.txt', 'root content'),
      ]

      await service.importFolder('testvault123', files)

      const content = await fs.readFile(path.join(vaultPath, 'root-file.txt'), 'utf-8')
      expect(content).toBe('root content')
    })

    it('should accept exactly the max number of files', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      const service = new ImportService(
        vaultManager,
        createMockVaultReader(),
        createMockConfig({ maxImportFiles: 3 }),
        createMockLogger(),
      )

      const files = [
        createUploadedFileWithPath('a.txt', 'a'),
        createUploadedFileWithPath('b.txt', 'b'),
        createUploadedFileWithPath('c.txt', 'c'),
      ]

      await service.importFolder('testvault123', files)

      const contentA = await fs.readFile(path.join(vaultPath, 'a.txt'), 'utf-8')
      expect(contentA).toBe('a')
    })

    it('should refresh the vault tree after successful folder import', async () => {
      const vault = createTestVault()
      const vaultManager = createMockVaultManager(vault)
      let readDirectoryCalled = false
      const vaultReader: IVaultReader = {
        readDirectory: async () => {
          readDirectoryCalled = true
          return { name: 'vault', type: 'directory' as const, path: '', children: [], itemCount: 1 }
        },
        readFile: async () => ({
          path: '', name: '', content: '', size: 0,
          encoding: 'utf-8' as const, isBinary: false, isTruncated: false, etag: '0000000000000000',
        }),
      }

      const service = new ImportService(
        vaultManager,
        vaultReader,
        createMockConfig(),
        createMockLogger(),
      )

      const files = [createUploadedFileWithPath('file.txt', 'data')]
      await service.importFolder('testvault123', files)

      expect(readDirectoryCalled).toBe(true)
    })
  })
})
