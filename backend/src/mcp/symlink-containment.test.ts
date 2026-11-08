// MCP file access must not follow symlinks out of the vault (realpath containment).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { registerToolHandlers } from './tool-handlers.js'
import type { ToolHandlerDeps } from './tool-handlers.js'
import { McpHandlers } from './handlers.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import type { IVaultReader } from '../vault/index.js'
import type { ILogger } from '../logger/index.js'
import type { ILinkIndex } from '../link-index/index.js'
import type { McpConfig } from './config.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

let baseDir: string
let vaultDir: string
let outsideDir: string

beforeEach(async () => {
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slatebase-mcp-symlink-'))
  vaultDir = path.join(baseDir, 'vault')
  outsideDir = path.join(baseDir, 'outside')
  await fs.mkdir(vaultDir)
  await fs.mkdir(outsideDir)
  await fs.writeFile(path.join(outsideDir, 'secret.md'), 'SECRET', 'utf-8')
  await fs.writeFile(path.join(vaultDir, 'Note.md'), 'normal', 'utf-8')
  await fs.mkdir(path.join(vaultDir, 'inner'))
  await fs.writeFile(path.join(vaultDir, 'inner', 'a.md'), 'inner-a', 'utf-8')
  await fs.symlink(path.join(outsideDir, 'secret.md'), path.join(vaultDir, 'link-file.md'))
  await fs.symlink(outsideDir, path.join(vaultDir, 'link-dir'))
  await fs.symlink(path.join(vaultDir, 'inner'), path.join(vaultDir, 'link-inner'))
})

afterEach(async () => {
  await fs.rm(baseDir, { recursive: true, force: true })
})

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger

function vaultService(): IVaultService {
  return {
    resolveFilePath: vi.fn((_id: string, p: string) => path.join(vaultDir, p)),
  } as unknown as IVaultService
}

function tool(name: string): (args: Record<string, unknown>) => Promise<CallToolResult> {
  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<CallToolResult>>()
  const server = {
    tool: (...args: unknown[]) => {
      handlers.set(args[0] as string, args[args.length - 1] as never)
    },
  }
  const deps: ToolHandlerDeps = {
    vaultService: vaultService(),
    vaultAccessControl: {
      checkReadAccess: vi.fn().mockResolvedValue(undefined),
      checkWriteAccess: vi.fn().mockResolvedValue(undefined),
    } as unknown as IVaultAccessControl,
    logger,
    mcpConfig: { maxFileSize: 1024 * 1024 } as McpConfig,
    getUserId: () => 'user-1',
    linkIndexResolver: async () => ({}) as ILinkIndex,
  }
  registerToolHandlers(server as never, deps)
  return handlers.get(name)!
}

function text(result: CallToolResult): string {
  return (result.content[0] as { text: string }).text
}

describe('read_file', () => {
  it('refuses a symlinked file pointing outside the vault', async () => {
    const result = await tool('read_file')({ vaultId: 'v1', path: 'link-file.md' })
    expect(result.isError).toBe(true)
    expect(text(result)).not.toContain('SECRET')
  })

  it('refuses a file below a symlinked directory pointing outside', async () => {
    const result = await tool('read_file')({ vaultId: 'v1', path: 'link-dir/secret.md' })
    expect(result.isError).toBe(true)
    expect(text(result)).not.toContain('SECRET')
  })

  it('reads regular files', async () => {
    const result = await tool('read_file')({ vaultId: 'v1', path: 'Note.md' })
    expect(result.isError).toBeUndefined()
    expect(text(result)).toContain('normal')
  })

  it('allows a symlink whose target stays inside the vault', async () => {
    const result = await tool('read_file')({ vaultId: 'v1', path: 'link-inner/a.md' })
    expect(result.isError).toBeUndefined()
    expect(text(result)).toContain('inner-a')
  })
})

describe('create_directory', () => {
  it('refuses to create directories through a symlinked directory', async () => {
    const result = await tool('create_directory')({ vaultId: 'v1', path: 'link-dir/new/deep' })
    expect(result.isError).toBe(true)
    await expect(fs.stat(path.join(outsideDir, 'new'))).rejects.toThrow()
  })

  it('creates regular directories', async () => {
    const result = await tool('create_directory')({ vaultId: 'v1', path: 'fresh/sub' })
    expect(result.isError).toBeUndefined()
    expect((await fs.stat(path.join(vaultDir, 'fresh', 'sub'))).isDirectory()).toBe(true)
  })
})

describe('unresolvable paths do not leak the server path', () => {
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0

  beforeEach(async () => {
    await fs.symlink(path.join(vaultDir, 'loop-b'), path.join(vaultDir, 'loop-a'))
    await fs.symlink(path.join(vaultDir, 'loop-a'), path.join(vaultDir, 'loop-b'))
  })

  it('read_file: symlink loop gives a generic error', async () => {
    const result = await tool('read_file')({ vaultId: 'v1', path: 'loop-a/x.md' })
    expect(result.isError).toBe(true)
    expect(text(result)).not.toContain(baseDir)
  })

  it('create_directory: symlink loop gives a generic error', async () => {
    const result = await tool('create_directory')({ vaultId: 'v1', path: 'loop-a/new' })
    expect(result.isError).toBe(true)
    expect(text(result)).not.toContain(baseDir)
  })

  it('resources/read: symlink loop gives a generic error', async () => {
    let cb!: (uri: URL, vars: Record<string, string>, extra: unknown) => Promise<unknown>
    new McpHandlers({
      vaultService: vaultService(),
      vaultAccessControl: { checkReadAccess: vi.fn().mockResolvedValue(undefined) } as unknown as IVaultAccessControl,
      vaultReader: {} as IVaultReader,
      logger,
      mcpConfig: { maxFileSize: 1024 * 1024 } as McpConfig,
    }).register({ resource: (...a: unknown[]) => { cb = a[a.length - 1] as typeof cb } } as never)
    const err = await cb(new URL('vault://v1/loop-a/x.md'), { vaultId: 'v1', path: 'loop-a/x.md' }, { authInfo: { extra: { userId: 'user-1' } } }).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).not.toContain(baseDir)
  })

  it.skipIf(isRoot)('read_file: unreadable directory gives a generic error', async () => {
    await fs.mkdir(path.join(vaultDir, 'locked'))
    await fs.chmod(path.join(vaultDir, 'locked'), 0o000)
    try {
      for (const name of ['read_file', 'create_directory']) {
        const result = await tool(name)({ vaultId: 'v1', path: 'locked/sub/x.md' })
        expect(result.isError).toBe(true)
        expect(text(result)).not.toContain(baseDir)
      }
    } finally {
      await fs.chmod(path.join(vaultDir, 'locked'), 0o755)
    }
  })
})

describe('search_vault', () => {
  it('skips a file that became a symlink after the tree scan and keeps searching', async () => {
    await fs.writeFile(path.join(vaultDir, 'Other.md'), 'SECRET also here', 'utf-8')
    await fs.writeFile(path.join(outsideDir, 'secret.md'), 'SECRET outside', 'utf-8')
    const handlers = new Map<string, (args: Record<string, unknown>) => Promise<CallToolResult>>()
    const server = { tool: (...a: unknown[]) => { handlers.set(a[0] as string, a[a.length - 1] as never) } }
    const stale = {
      name: 'vault', type: 'directory', path: '',
      children: [
        { name: 'Swapped.md', type: 'file', path: 'Swapped.md' },
        { name: 'Other.md', type: 'file', path: 'Other.md' },
      ],
    }
    // Swapped.md was a regular file when the (cached) tree was built, then replaced by a symlink
    await fs.symlink(path.join(outsideDir, 'secret.md'), path.join(vaultDir, 'Swapped.md'))
    registerToolHandlers(server as never, {
      vaultService: { ...vaultService(), getVaultTree: vi.fn().mockResolvedValue(stale) } as unknown as IVaultService,
      vaultAccessControl: { checkReadAccess: vi.fn().mockResolvedValue(undefined), checkWriteAccess: vi.fn() } as unknown as IVaultAccessControl,
      logger,
      mcpConfig: { maxFileSize: 1024 * 1024 } as McpConfig,
      getUserId: () => 'user-1',
    })
    const result = await handlers.get('search_vault')!({ vaultId: 'v1', query: 'SECRET', maxResults: 10 })
    const out = text(result)
    expect(out).toContain('Other.md')
    expect(out).not.toContain('Swapped.md')
    expect(out).not.toContain('outside')
  })
})

describe('query_base', () => {
  it('refuses a symlinked .base file pointing outside the vault', async () => {
    await fs.writeFile(path.join(outsideDir, 'x.base'), 'views: []\n', 'utf-8')
    await fs.symlink(path.join(outsideDir, 'x.base'), path.join(vaultDir, 'x.base'))
    const result = await tool('query_base')({ vaultId: 'v1', path: 'x.base' })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('Invalid file path')
  })
})

describe('resources/read', () => {
  type ReadCb = (uri: URL, vars: Record<string, string>, extra: unknown) => Promise<{ contents: Array<Record<string, unknown>> }>

  function reader(): (p: string) => ReturnType<ReadCb> {
    let cb!: ReadCb
    new McpHandlers({
      vaultService: vaultService(),
      vaultAccessControl: { checkReadAccess: vi.fn().mockResolvedValue(undefined) } as unknown as IVaultAccessControl,
      vaultReader: {} as IVaultReader,
      logger,
      mcpConfig: { maxFileSize: 1024 * 1024 } as McpConfig,
    }).register({ resource: (...a: unknown[]) => { cb = a[a.length - 1] as ReadCb } } as never)
    return (p) => cb(new URL(`vault://v1/${p}`), { vaultId: 'v1', path: p }, { authInfo: { extra: { userId: 'user-1' } } })
  }

  it('refuses symlinks leaving the vault', async () => {
    await expect(reader()('link-file.md')).rejects.toThrow()
    await expect(reader()('link-dir/secret.md')).rejects.toThrow()
  })

  it('serves regular files', async () => {
    const res = await reader()('Note.md')
    expect(res.contents[0]).toMatchObject({ text: 'normal' })
  })
})
